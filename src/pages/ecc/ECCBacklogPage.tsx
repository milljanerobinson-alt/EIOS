import { useEffect, useRef, useState } from 'react';
import {
  Plus, X, ChevronDown, Loader2, Trash2, GripVertical,
  ArrowUpRight, Check, Circle, Clock, AlertCircle, CheckCircle2,
  Archive, Rocket, ClipboardList, Link2, Tag, User,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useActiveRC } from '../../lib/activeRC';

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority   = 'low' | 'medium' | 'high' | 'critical';
type Complexity = 'trivial' | 'small' | 'medium' | 'large' | 'epic';

interface BacklogCard {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  risk: string | null;
  complexity: string | null;
  status: string;
  tags: string[];
  notes: string | null;
  implementation_notes: string | null;
  dependencies: string | null;
  acceptance_criteria: string | null;
  target_version: string | null;
  target_phase: string | null;
  workstream: string | null;
  milestone: string | null;
  owner: string | null;
  attachments: string[];
  linked_qa_ids: string[];
  linked_release_ids: string[];
  linked_decision_ids: string[];
  linked_ai_ids: string[];
  position: number;
  created_at: string;
  updated_at: string;
}

type CardInput = Omit<BacklogCard, 'id' | 'created_at' | 'updated_at'>;

interface QAOption  { id: string; title: string; result: string; test_date: string; }
interface RelOption { id: string; version: string; name: string | null; status: string; }

// ─── Column config ────────────────────────────────────────────────────────────
// Each column defines which status values appear in it. New cards created in
// that column get the first status in the list.

type ColumnDef = {
  key: string;
  title: string;
  primaryStatus: string;
  displayStatuses: string[];
  dot: string;
  bg: string;
  border: string;
  icon: typeof Circle;
};

const COLUMNS: ColumnDef[] = [
  { key: 'ideas',            title: 'Ideas',              primaryStatus: 'ideas',            displayStatuses: ['ideas'],                         dot: 'bg-slate-400',    bg: 'bg-slate-50',       border: 'border-slate-200',   icon: Circle },
  { key: 'planned',          title: 'Planned',            primaryStatus: 'planned',          displayStatuses: ['planned','needs_investigation'],  dot: 'bg-orange-400',   bg: 'bg-orange-50/40',   border: 'border-orange-200',  icon: Clock },
  { key: 'ready',            title: 'Ready',              primaryStatus: 'ready',            displayStatuses: ['ready'],                         dot: 'bg-blue-400',     bg: 'bg-blue-50/40',     border: 'border-blue-200',    icon: Clock },
  { key: 'in_progress',      title: 'In Progress',        primaryStatus: 'in_progress',      displayStatuses: ['in_progress'],                   dot: 'bg-amber-500',    bg: 'bg-amber-50/40',    border: 'border-amber-200',   icon: Clock },
  { key: 'needs_review',     title: 'Needs Review',       primaryStatus: 'needs_review',     displayStatuses: ['needs_review'],                  dot: 'bg-violet-500',   bg: 'bg-violet-50/40',   border: 'border-violet-200',  icon: AlertCircle },
  { key: 'testing',          title: 'Testing',            primaryStatus: 'testing',          displayStatuses: ['testing'],                       dot: 'bg-cyan-500',     bg: 'bg-cyan-50/40',     border: 'border-cyan-200',    icon: CheckCircle2 },
  { key: 'release_candidate',title: 'Release Candidate',  primaryStatus: 'release_candidate',displayStatuses: ['release_candidate'],             dot: 'bg-indigo-500',   bg: 'bg-indigo-50/40',   border: 'border-indigo-200',  icon: Rocket },
  { key: 'completed',        title: 'Completed',          primaryStatus: 'completed',        displayStatuses: ['completed','verified'],          dot: 'bg-emerald-500',  bg: 'bg-emerald-50/40',  border: 'border-emerald-200', icon: CheckCircle2 },
  { key: 'archived',         title: 'Archived',           primaryStatus: 'archived',         displayStatuses: ['archived','released'],           dot: 'bg-slate-300',    bg: 'bg-slate-50',       border: 'border-slate-200',   icon: Archive },
];

// Build reverse lookup: status → column key (for drag/drop + filtering)
const STATUS_TO_COL: Record<string, string> = {};
COLUMNS.forEach(c => c.displayStatuses.forEach(s => { STATUS_TO_COL[s] = c.key; }));

const PRIORITY_CFG: Record<Priority, { label: string; dot: string; text: string }> = {
  low:      { label: 'Low',      dot: 'bg-slate-400',  text: 'text-slate-500' },
  medium:   { label: 'Medium',   dot: 'bg-blue-400',   text: 'text-blue-600' },
  high:     { label: 'High',     dot: 'bg-amber-500',  text: 'text-amber-600' },
  critical: { label: 'Critical', dot: 'bg-red-500',    text: 'text-red-600' },
};

const COMPLEXITY_LABELS: Record<Complexity, string> = {
  trivial: 'Trivial', small: 'Small', medium: 'Medium', large: 'Large', epic: 'Epic',
};

const EMPTY_INPUT = (status: string): CardInput => ({
  title: '', description: null, priority: 'medium', risk: null, complexity: null,
  status, tags: [], notes: null, implementation_notes: null,
  dependencies: null, acceptance_criteria: null, target_version: null, target_phase: null,
  workstream: null, milestone: null, owner: null, attachments: [],
  linked_qa_ids: [], linked_release_ids: [], linked_decision_ids: [], linked_ai_ids: [],
  position: 0,
});

function colForStatus(status: string): ColumnDef {
  return COLUMNS.find(c => c.displayStatuses.includes(status)) ?? COLUMNS[0];
}

// ─── Multi-select ─────────────────────────────────────────────────────────────

function LinkedMultiSelect<T extends { id: string }>({
  label, all, selected, getLabel, onToggle,
}: {
  label: string;
  all: T[];
  selected: string[];
  getLabel: (item: T) => string;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedItems = all.filter(i => selected.includes(i.id));

  return (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full text-left px-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none hover:border-slate-300 transition-colors flex items-center justify-between">
          <span className="text-slate-600 truncate">
            {selectedItems.length === 0
              ? <span className="text-slate-300">None linked</span>
              : selectedItems.map(i => getLabel(i)).join(', ')}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
        </button>
        {open && (
          <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {all.length === 0
              ? <p className="text-xs text-slate-400 p-3 text-center">No items available</p>
              : all.map(item => {
                  const checked = selected.includes(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => onToggle(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition-colors text-left ${checked ? 'text-slate-800' : 'text-slate-500'}`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${checked ? 'bg-slate-800 border-slate-800' : 'border-slate-300'}`}>
                        {checked && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="truncate">{getLabel(item)}</span>
                    </button>
                  );
                })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card Drawer ──────────────────────────────────────────────────────────────

function CardDrawer({ card, defaultStatus, onClose, onSave, onDelete }: {
  card: BacklogCard | null; defaultStatus: string;
  onClose: () => void; onSave: (d: CardInput) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [form, setForm] = useState<CardInput>(card ? { ...card } : EMPTY_INPUT(defaultStatus));
  const [tab, setTab] = useState<'details' | 'criteria' | 'links' | 'notes'>('details');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [qaOptions, setQaOptions] = useState<QAOption[]>([]);
  const [releaseOptions, setReleaseOptions] = useState<RelOption[]>([]);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    supabase.from('ecc_testing_reports').select('id,title,result,test_date').order('test_date', { ascending: false }).limit(50).then(({ data }) => setQaOptions(data ?? []));
    supabase.from('ecc_releases').select('id,version,name,status').order('created_at', { ascending: false }).limit(50).then(({ data }) => setReleaseOptions(data ?? []));
  }, []);

  function set<K extends keyof CardInput>(k: K, v: CardInput[K]) { setForm(f => ({ ...f, [k]: v })); }
  function toggleId(key: 'linked_qa_ids' | 'linked_release_ids' | 'linked_decision_ids' | 'linked_ai_ids', id: string) {
    setForm(f => ({
      ...f,
      [key]: (f[key] as string[]).includes(id)
        ? (f[key] as string[]).filter(x => x !== id)
        : [...(f[key] as string[]), id],
    }));
  }
  function setTags(raw: string) { set('tags', raw.split(',').map(s => s.trim()).filter(Boolean)); }
  function setAttachments(raw: string) { set('attachments', raw.split('\n').map(s => s.trim()).filter(Boolean)); }

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    await onSave({ ...form, title: form.title.trim() });
    setSaving(false);
  }

  const TABS = [
    { key: 'details' as const, label: 'Details' },
    { key: 'criteria' as const, label: 'Acceptance Criteria' },
    { key: 'links' as const, label: 'Links' },
    { key: 'notes' as const, label: 'Notes' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">{card ? 'Edit Item' : 'New Backlog Item'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex border-b border-slate-200 px-4 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`text-xs font-medium px-3 py-3 mr-1 border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {tab === 'details' && <>
            <div><label className={LABEL}>Title</label><input ref={titleRef} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Item title…" className={INPUT} /></div>
            <div><label className={LABEL}>Description</label><textarea value={form.description ?? ''} onChange={e => set('description', e.target.value || null)} rows={3} className={INPUT + ' resize-none'} /></div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Status</label>
                <div className="relative">
                  <select value={form.status} onChange={e => set('status', e.target.value)} className={SELECT}>
                    {COLUMNS.map(c => <option key={c.primaryStatus} value={c.primaryStatus}>{c.title}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div><label className={LABEL}>Priority</label>
                <div className="relative">
                  <select value={form.priority} onChange={e => set('priority', e.target.value as Priority)} className={SELECT}>
                    {(['low','medium','high','critical'] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_CFG[p].label}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Owner</label><input value={form.owner ?? ''} onChange={e => set('owner', e.target.value || null)} placeholder="Name" className={INPUT} /></div>
              <div><label className={LABEL}>Workstream</label><input value={form.workstream ?? ''} onChange={e => set('workstream', e.target.value || null)} placeholder="e.g. Platform" className={INPUT} /></div>
            </div>

            <div><label className={LABEL}>Milestone</label><input value={form.milestone ?? ''} onChange={e => set('milestone', e.target.value || null)} placeholder="e.g. M1 — Auth" className={INPUT} /></div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Risk</label>
                <div className="relative">
                  <select value={form.risk ?? ''} onChange={e => set('risk', e.target.value || null)} className={SELECT}>
                    <option value="">—</option>
                    {['low','medium','high','critical'].map(r => <option key={r} value={r} className="capitalize">{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div><label className={LABEL}>Complexity</label>
                <div className="relative">
                  <select value={form.complexity ?? ''} onChange={e => set('complexity', e.target.value || null)} className={SELECT}>
                    <option value="">—</option>
                    {(['trivial','small','medium','large','epic'] as Complexity[]).map(c => <option key={c} value={c}>{COMPLEXITY_LABELS[c]}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><label className={LABEL}>Target Development Stage</label><input value={form.target_phase ?? ''} onChange={e => set('target_phase', e.target.value || null)} placeholder="Phase 3" className={INPUT} /></div>
              <div><label className={LABEL}>Target Version</label><input value={form.target_version ?? ''} onChange={e => set('target_version', e.target.value || null)} placeholder="1.0.0" className={INPUT} /></div>
            </div>

            <div>
              <label className={LABEL}>Labels <span className="font-normal normal-case text-slate-400">(comma-separated)</span></label>
              <input value={form.tags.join(', ')} onChange={e => setTags(e.target.value)} placeholder="auth, backend, ui" className={INPUT} />
            </div>

            <div><label className={LABEL}>Dependencies</label>
              <textarea value={form.dependencies ?? ''} onChange={e => set('dependencies', e.target.value || null)} rows={2} placeholder="List any blocking items…" className={INPUT + ' resize-none'} />
            </div>
          </>}

          {tab === 'criteria' && (
            <div><label className={LABEL}>Acceptance Criteria</label>
              <p className="text-xs text-slate-400 mb-2">What must be true for this item to be considered done?</p>
              <textarea value={form.acceptance_criteria ?? ''} onChange={e => set('acceptance_criteria', e.target.value || null)} rows={18} placeholder={"Given...\nWhen...\nThen...\n\n- Criterion 1\n- Criterion 2"} className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
          )}

          {tab === 'links' && <>
            <p className="text-xs text-slate-400">Link this backlog item to related QA reports and releases. Relationships are bidirectional.</p>

            <LinkedMultiSelect<QAOption>
              label="Linked QA Reports"
              all={qaOptions}
              selected={form.linked_qa_ids ?? []}
              getLabel={q => `${q.title} (${q.result})`}
              onToggle={id => toggleId('linked_qa_ids', id)}
            />

            <LinkedMultiSelect<RelOption>
              label="Linked Releases"
              all={releaseOptions}
              selected={form.linked_release_ids ?? []}
              getLabel={r => r.name ? `${r.version} — ${r.name}` : r.version}
              onToggle={id => toggleId('linked_release_ids', id)}
            />

            <div>
              <label className={LABEL}>Attachments <span className="font-normal normal-case text-slate-400">(one per line)</span></label>
              <textarea
                value={form.attachments.join('\n')}
                onChange={e => setAttachments(e.target.value)}
                rows={4}
                placeholder="https://..."
                className={INPUT + ' resize-none font-mono text-xs'}
              />
            </div>
          </>}

          {tab === 'notes' && <>
            <div><label className={LABEL}>Notes</label>
              <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value || null)} rows={8} placeholder="Context, decisions, blockers…" className={INPUT + ' resize-none'} />
            </div>
            <div><label className={LABEL}>Implementation Notes</label>
              <textarea value={form.implementation_notes ?? ''} onChange={e => set('implementation_notes', e.target.value || null)} rows={8} placeholder="Prompts, migrations, edge functions…" className={INPUT + ' resize-none font-mono text-xs'} />
            </div>
          </>}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <div>
            {card && (confirmDel
              ? <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Delete?</span>
                  <button onClick={async () => { setDeleting(true); await onDelete?.(); }} disabled={deleting} className="text-xs font-semibold text-red-600">{deleting ? 'Deleting…' : 'Confirm'}</button>
                  <button onClick={() => setConfirmDel(false)} className="text-xs text-slate-400">Cancel</button>
                </div>
              : <button onClick={() => setConfirmDel(true)} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" />Delete</button>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="text-sm text-slate-500 px-4 py-2">Cancel</button>
            <button onClick={handleSave} disabled={!form.title.trim() || saving}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {card ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card Component ───────────────────────────────────────────────────────────

function KanbanCard({ card, onClick, onDragStart, onDragEnd, isDragging }: {
  card: BacklogCard; onClick: () => void;
  onDragStart: (e: React.DragEvent) => void; onDragEnd: (e: React.DragEvent) => void; isDragging: boolean;
}) {
  const p = PRIORITY_CFG[card.priority];
  const hasLinks = (card.linked_qa_ids?.length ?? 0) + (card.linked_release_ids?.length ?? 0) > 0;
  return (
    <div draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      className={`group bg-white rounded-xl border border-slate-200 p-3.5 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all select-none ${isDragging ? 'opacity-40 scale-[0.98]' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />{p.label}
        </span>
        <div className="flex items-center gap-1.5">
          {card.complexity && <span className="text-xs text-slate-300">{card.complexity}</span>}
          <GripVertical className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 transition-colors" />
        </div>
      </div>
      <p className="text-sm font-semibold text-slate-800 leading-snug mb-1">{card.title}</p>
      {card.description && <p className="text-xs text-slate-400 line-clamp-2 mb-2">{card.description}</p>}
      {(card.owner || card.workstream || card.tags.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {card.owner && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <User className="w-3 h-3" />{card.owner}
            </span>
          )}
          {card.workstream && (
            <span className="text-xs text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">{card.workstream}</span>
          )}
          {card.tags.slice(0, 2).map(t => (
            <span key={t} className="text-xs text-blue-500 bg-blue-50 rounded px-1.5 py-0.5 flex items-center gap-0.5">
              <Tag className="w-2.5 h-2.5" />{t}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-300">{card.target_phase ?? ''}</span>
          {hasLinks && (
            <span className="inline-flex items-center gap-0.5 text-xs text-slate-400">
              <Link2 className="w-3 h-3" />
              {(card.linked_qa_ids?.length ?? 0) + (card.linked_release_ids?.length ?? 0)}
            </span>
          )}
        </div>
        <ArrowUpRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 transition-colors" />
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const SELECT = "w-full appearance-none px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white pr-8";
const INPUT  = "w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white placeholder-slate-300";
const LABEL  = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5";

// ─── Main Backlog Page ────────────────────────────────────────────────────────

export function ECCBacklogPage() {
  const [cards, setCards] = useState<BacklogCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { activeRC, addToActiveRC, logEvent } = useActiveRC();
  const [editing, setEditing] = useState<BacklogCard | null>(null);
  const [defaultStatus, setDefaultStatus] = useState('ideas');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const dragTypeRef = useRef<'card' | null>(null);

  useEffect(() => {
    supabase.from('ecc_backlog_items')
      .select('id,title,description,priority,risk,complexity,status,tags,notes,implementation_notes,dependencies,acceptance_criteria,target_version,target_phase,workstream,milestone,owner,attachments,linked_qa_ids,linked_release_ids,linked_decision_ids,linked_ai_ids,position,created_at,updated_at')
      .order('position').order('created_at', { ascending: false })
      .then(({ data }) => {
        setCards((data ?? []).map(c => ({
          ...c,
          tags: Array.isArray(c.tags) ? c.tags : [],
          attachments: Array.isArray(c.attachments) ? c.attachments : [],
          linked_qa_ids: Array.isArray(c.linked_qa_ids) ? c.linked_qa_ids : [],
          linked_release_ids: Array.isArray(c.linked_release_ids) ? c.linked_release_ids : [],
          linked_decision_ids: Array.isArray(c.linked_decision_ids) ? c.linked_decision_ids : [],
          linked_ai_ids: Array.isArray(c.linked_ai_ids) ? c.linked_ai_ids : [],
        })));
        setLoading(false);
      });
  }, []);

  function openNew(status: string) { setEditing(null); setDefaultStatus(status); setDrawerOpen(true); }
  function openEdit(card: BacklogCard) { setEditing(card); setDrawerOpen(true); }
  function closeDrawer() { setDrawerOpen(false); setEditing(null); }

  async function handleSave(data: CardInput) {
    const safeData = {
      ...data,
      tags: data.tags,
      attachments: data.attachments,
      linked_qa_ids: data.linked_qa_ids,
      linked_release_ids: data.linked_release_ids,
      linked_decision_ids: data.linked_decision_ids,
      linked_ai_ids: data.linked_ai_ids,
    };
    if (editing) {
      const { data: updated } = await supabase.from('ecc_backlog_items').update({ ...safeData, updated_at: new Date().toISOString() }).eq('id', editing.id).select().single();
      if (updated) setCards(cs => cs.map(c => c.id === updated.id ? normalise(updated) : c));
    } else {
      const col = STATUS_TO_COL[data.status] ?? data.status;
      const pos = cards.filter(c => (STATUS_TO_COL[c.status] ?? c.status) === col).length;
      const { data: created } = await supabase.from('ecc_backlog_items').insert({ ...safeData, position: pos }).select().single();
      if (created) {
        setCards(cs => [...cs, normalise(created)]);
        if (activeRC) {
          await addToActiveRC('backlog', created.id);
          await logEvent({ event_type: 'item_added_to_rc', event_label: `Backlog item added: ${created.title}`, entity_type: 'backlog_item', entity_id: created.id, entity_title: created.title });
        }
      }
    }
    closeDrawer();
  }

  function normalise(c: BacklogCard): BacklogCard {
    return {
      ...c,
      tags: Array.isArray(c.tags) ? c.tags : [],
      attachments: Array.isArray(c.attachments) ? c.attachments : [],
      linked_qa_ids: Array.isArray(c.linked_qa_ids) ? c.linked_qa_ids : [],
      linked_release_ids: Array.isArray(c.linked_release_ids) ? c.linked_release_ids : [],
      linked_decision_ids: Array.isArray(c.linked_decision_ids) ? c.linked_decision_ids : [],
      linked_ai_ids: Array.isArray(c.linked_ai_ids) ? c.linked_ai_ids : [],
    };
  }

  async function handleDelete() {
    if (!editing) return;
    await supabase.from('ecc_backlog_items').delete().eq('id', editing.id);
    setCards(cs => cs.filter(c => c.id !== editing.id));
    closeDrawer();
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    dragTypeRef.current = 'card'; e.dataTransfer.effectAllowed = 'move'; setDraggingId(id);
  }
  function handleDragEnd() { dragTypeRef.current = null; setDraggingId(null); setDragOverCol(null); }
  function handleDragOver(e: React.DragEvent, colKey: string) {
    if (dragTypeRef.current !== 'card') return; e.preventDefault(); setDragOverCol(colKey);
  }
  async function handleDrop(e: React.DragEvent, col: ColumnDef) {
    e.preventDefault();
    if (!draggingId) return;
    const card = cards.find(c => c.id === draggingId);
    if (!card) { setDraggingId(null); setDragOverCol(null); return; }
    const currentCol = STATUS_TO_COL[card.status] ?? card.status;
    if (currentCol === col.key) { setDraggingId(null); setDragOverCol(null); return; }
    const newStatus = col.primaryStatus;
    const newPos = cards.filter(c => (STATUS_TO_COL[c.status] ?? c.status) === col.key).length;
    setCards(cs => cs.map(c => c.id === draggingId ? { ...c, status: newStatus, position: newPos } : c));
    await supabase.from('ecc_backlog_items').update({ status: newStatus, position: newPos, updated_at: new Date().toISOString() }).eq('id', draggingId);
    setDraggingId(null); setDragOverCol(null);
  }

  function filteredForCol(col: ColumnDef) {
    return cards
      .filter(c => col.displayStatuses.includes(c.status))
      .filter(c => !filterPriority || c.priority === filterPriority)
      .filter(c => !search || c.title.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.position - b.position);
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 text-slate-300 animate-spin" /></div>;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="px-6 lg:px-8 pt-5 pb-3 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ClipboardList className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-800">Backlog</span>
            <span className="text-xs text-slate-400">{cards.length} items</span>
          </div>
          <button onClick={() => openNew('ideas')}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items…"
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 bg-white max-w-xs placeholder-slate-300" />
          {(['critical','high','medium','low'] as const).map(p => (
            <button key={p} onClick={() => setFilterPriority(filterPriority === p ? null : p)}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full border transition-all ${filterPriority === p ? 'bg-slate-800 text-white border-transparent' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_CFG[p].dot}`} />{PRIORITY_CFG[p].label}
            </button>
          ))}
          {(search || filterPriority) && <button onClick={() => { setSearch(''); setFilterPriority(null); }} className="text-xs text-slate-400 hover:text-slate-600">Clear</button>}
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto px-6 lg:px-8 pb-8">
        <div className="flex gap-4 h-full" style={{ minWidth: `${COLUMNS.length * 260 + 64}px` }}>
          {COLUMNS.map(col => {
            const colCards = filteredForCol(col);
            const isOver = dragOverCol === col.key;
            const Icon = col.icon;
            return (
              <div key={col.key} className="flex flex-col min-w-[240px] max-w-[280px] flex-1">
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                    <span className="text-sm font-semibold text-slate-700">{col.title}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5 leading-none">{colCards.length}</span>
                  </div>
                  <button onClick={() => openNew(col.primaryStatus)} className="text-slate-300 hover:text-slate-600 transition-colors"><Plus className="w-4 h-4" /></button>
                </div>
                <div onDragOver={e => handleDragOver(e, col.key)} onDrop={e => handleDrop(e, col)}
                  className={`flex-1 rounded-xl border-2 p-2 transition-all min-h-[200px] ${isOver ? 'border-slate-400 bg-slate-100' : `border-dashed border-transparent ${col.bg}`}`}>
                  <div className="space-y-2">
                    {colCards.map(c => (
                      <KanbanCard key={c.id} card={c} onClick={() => openEdit(c)}
                        onDragStart={e => handleDragStart(e, c.id)} onDragEnd={handleDragEnd} isDragging={draggingId === c.id} />
                    ))}
                  </div>
                  {colCards.length === 0 && !isOver && (
                    <div className="flex flex-col items-center justify-center py-10">
                      <Icon className="w-7 h-7 text-slate-200 mb-2" />
                      <p className="text-xs text-slate-300">Empty</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {drawerOpen && (
        <CardDrawer card={editing} defaultStatus={defaultStatus} onClose={closeDrawer} onSave={handleSave} onDelete={editing ? handleDelete : undefined} />
      )}
    </div>
  );
}
