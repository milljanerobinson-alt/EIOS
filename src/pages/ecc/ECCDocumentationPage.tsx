import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useActiveRC } from '../../lib/activeRC';
import {
  FileText, Plus, Search, X, ChevronDown, ChevronUp, ExternalLink,
  Tag, User, Clock, Layers, BookOpen, Database, Zap, Globe, Shield,
  ClipboardCheck, Settings, LifeBuoy, GitBranch, Package, ClipboardList,
  AlertCircle, Save, Trash2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocRecord {
  id: string;
  created_at: string;
  title: string;
  content: string | null;
  doc_type: string;
  tags: string[] | null;
  author: string | null;
  version: string | null;
  status: string;
  updated_at: string | null;
  linked_backlog_ids: string[] | null;
  linked_release_ids: string[] | null;
  linked_adr_ids: string[] | null;
}

type DocInput = Omit<DocRecord, 'id' | 'created_at'>;

interface BacklogItem { id: string; title: string; }
interface Release     { id: string; name: string; version: string; }
interface ADR         { id: string; title: string; adr_number: string | null; }

// ─── Section Config ──────────────────────────────────────────────────────────

const SECTIONS: { key: string; label: string; icon: typeof FileText; color: string; desc: string }[] = [
  { key: 'product',         label: 'Product',         icon: BookOpen,      color: 'text-violet-600',  desc: 'Product specs, feature docs, user flows' },
  { key: 'architecture',    label: 'Architecture',     icon: GitBranch,     color: 'text-blue-600',    desc: 'System design, ADRs, tech decisions' },
  { key: 'database',        label: 'Database',         icon: Database,      color: 'text-emerald-600', desc: 'Schema docs, migrations, data models' },
  { key: 'apis',            label: 'APIs',             icon: Globe,         color: 'text-cyan-600',    desc: 'REST endpoints, request/response specs' },
  { key: 'edge-functions',  label: 'Edge Functions',   icon: Zap,           color: 'text-amber-600',   desc: 'Supabase edge function docs' },
  { key: 'integrations',    label: 'Integrations',     icon: Layers,        color: 'text-indigo-600',  desc: 'Third-party services and integrations' },
  { key: 'security',        label: 'Security',         icon: Shield,        color: 'text-red-600',     desc: 'Auth flows, RLS, security controls' },
  { key: 'compliance',      label: 'Compliance',       icon: ClipboardCheck, color: 'text-teal-600',   desc: 'ACSF, WCAG, accessibility standards' },
  { key: 'testing',         label: 'Testing',          icon: ClipboardList, color: 'text-orange-600',  desc: 'Test plans, strategies, coverage' },
  { key: 'operations',      label: 'Operations',       icon: Settings,      color: 'text-slate-600',   desc: 'Deployments, infra, runbooks' },
  { key: 'troubleshooting', label: 'Troubleshooting',  icon: LifeBuoy,      color: 'text-rose-600',    desc: 'Known issues, debug guides, FAQs' },
];

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  draft:     { label: 'Draft',     dot: 'bg-slate-400',   bg: 'bg-slate-100',   text: 'text-slate-700' },
  review:    { label: 'Review',    dot: 'bg-amber-400',   bg: 'bg-amber-50',    text: 'text-amber-700' },
  published: { label: 'Published', dot: 'bg-emerald-500', bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  archived:  { label: 'Archived',  dot: 'bg-slate-300',   bg: 'bg-slate-50',    text: 'text-slate-500' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArray(val: string): string[] {
  return val.split('\n').map(s => s.trim()).filter(Boolean);
}

// ─── LinkedMultiSelect ────────────────────────────────────────────────────────

function LinkedMultiSelect<T extends { id: string }>({
  label, items, selected, onToggle, renderItem,
}: {
  label: string;
  items: T[];
  selected: string[];
  onToggle: (id: string) => void;
  renderItem: (item: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedItems = items.filter(i => selected.includes(i.id));

  return (
    <div ref={ref} className="relative">
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-slate-300 transition-colors"
      >
        <span className="truncate text-left">
          {selectedItems.length === 0
            ? <span className="text-slate-400">Select {label.toLowerCase()}…</span>
            : selectedItems.map(i => renderItem(i)).join(', ')}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">No items available</p>
          ) : items.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs hover:bg-slate-50 transition-colors text-left ${
                selected.includes(item.id) ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                selected.includes(item.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
              }`}>
                {selected.includes(item.id) && <div className="w-1.5 h-1.5 bg-white rounded-sm" />}
              </div>
              {renderItem(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── DocCard ──────────────────────────────────────────────────────────────────

function DocCard({
  doc, onEdit, onDelete,
}: {
  doc: DocRecord;
  onEdit: (doc: DocRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sectionCfg = SECTIONS.find(s => s.key === doc.doc_type);
  const SectionIcon = sectionCfg?.icon ?? FileText;
  const statusCfg = STATUS_CFG[doc.status] ?? STATUS_CFG.draft;
  const linkCount = (doc.linked_backlog_ids?.length ?? 0) + (doc.linked_release_ids?.length ?? 0) + (doc.linked_adr_ids?.length ?? 0);

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-all shadow-sm">
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center shrink-0`}>
            <SectionIcon className={`w-4.5 h-4.5 ${sectionCfg?.color ?? 'text-slate-400'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 leading-snug">{doc.title}</h3>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onEdit(doc)} className="p-1 text-slate-400 hover:text-blue-600 transition-colors rounded">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => onDelete(doc.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                {statusCfg.label}
              </span>
              {doc.version && (
                <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">v{doc.version}</span>
              )}
              {doc.author && (
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <User className="w-3 h-3" /> {doc.author}
                </span>
              )}
              {linkCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <Layers className="w-3 h-3" /> {linkCount} link{linkCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {doc.tags && doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {doc.tags.map(t => (
                  <span key={t} className="flex items-center gap-0.5 text-[9px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                    <Tag className="w-2.5 h-2.5" /> {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {doc.content && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'Collapse' : 'View content'}
          </button>
        )}
      </div>

      {expanded && doc.content && (
        <div className="border-t border-slate-100 px-4 py-3">
          <pre className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed font-mono bg-slate-50 rounded-lg p-3 overflow-x-auto max-h-96">
            {doc.content}
          </pre>
          <div className="flex items-center gap-1 mt-2 text-[10px] text-slate-400">
            <Clock className="w-3 h-3" />
            {doc.updated_at
              ? `Updated ${new Date(doc.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} at ${new Date(doc.updated_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}`
              : `Created ${new Date(doc.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })} at ${new Date(doc.created_at).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })}`}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DocDrawer ────────────────────────────────────────────────────────────────

function DocDrawer({
  initial, onClose, onSave,
  backlogItems, releases, adrs,
}: {
  initial: DocRecord | null;
  onClose: () => void;
  onSave: () => void;
  backlogItems: BacklogItem[];
  releases: Release[];
  adrs: ADR[];
}) {
  const isNew = !initial;
  const [activeTab, setActiveTab] = useState<'content' | 'metadata' | 'links'>('content');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<DocInput>({
    title: initial?.title ?? '',
    content: initial?.content ?? '',
    doc_type: initial?.doc_type ?? 'product',
    tags: initial?.tags ?? [],
    author: initial?.author ?? '',
    version: initial?.version ?? '',
    status: initial?.status ?? 'draft',
    updated_at: initial?.updated_at ?? null,
    linked_backlog_ids: initial?.linked_backlog_ids ?? [],
    linked_release_ids: initial?.linked_release_ids ?? [],
    linked_adr_ids: initial?.linked_adr_ids ?? [],
  });

  const [tagsRaw, setTagsRaw] = useState((initial?.tags ?? []).join('\n'));

  function set<K extends keyof DocInput>(key: K, val: DocInput[K]) {
    setForm(f => ({ ...f, [key]: val }));
  }

  function toggleArr(field: 'linked_backlog_ids' | 'linked_release_ids' | 'linked_adr_ids', id: string) {
    const cur = (form[field] ?? []) as string[];
    set(field, cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      tags: parseArray(tagsRaw),
      updated_at: new Date().toISOString(),
    };
    let err: unknown;
    if (isNew) {
      ({ error: err } = await supabase.from('ecc_documentation').insert([payload]));
    } else {
      ({ error: err } = await supabase.from('ecc_documentation').update(payload).eq('id', initial!.id));
    }
    setSaving(false);
    if (err) { setError(String((err as Error).message)); return; }
    onSave();
  }

  const tabs = [
    { key: 'content' as const,  label: 'Content' },
    { key: 'metadata' as const, label: 'Metadata' },
    { key: 'links' as const,    label: 'Links' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="w-full max-w-xl bg-white h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-slate-500">{isNew ? 'New Document' : 'Edit Document'}</p>
              <p className="text-sm font-semibold text-slate-900 leading-tight">{form.title || 'Untitled'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                activeTab === t.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}

          {activeTab === 'content' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Title <span className="text-red-400">*</span></label>
                <input
                  value={form.title}
                  onChange={e => set('title', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  placeholder="Document title"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Section</label>
                <select
                  value={form.doc_type}
                  onChange={e => set('doc_type', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                >
                  {SECTIONS.map(s => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Content</label>
                <textarea
                  value={form.content ?? ''}
                  onChange={e => set('content', e.target.value)}
                  rows={16}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                  placeholder="Write documentation content here. Markdown is rendered as plain text."
                />
              </div>
            </>
          )}

          {activeTab === 'metadata' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS_CFG).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set('status', k)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                        form.status === k
                          ? `${v.bg} ${v.text} border-current`
                          : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${v.dot}`} />
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Author</label>
                <input
                  value={form.author ?? ''}
                  onChange={e => set('author', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  placeholder="Author name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Version</label>
                <input
                  value={form.version ?? ''}
                  onChange={e => set('version', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  placeholder="e.g. 1.0.0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Tags <span className="text-slate-400 font-normal">(one per line)</span></label>
                <textarea
                  value={tagsRaw}
                  onChange={e => setTagsRaw(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                  placeholder="acsf&#10;auth&#10;supabase"
                />
              </div>
            </>
          )}

          {activeTab === 'links' && (
            <>
              <LinkedMultiSelect<BacklogItem>
                label="Linked Backlog Items"
                items={backlogItems}
                selected={(form.linked_backlog_ids ?? []) as string[]}
                onToggle={id => toggleArr('linked_backlog_ids', id)}
                renderItem={i => i.title}
              />
              <LinkedMultiSelect<Release>
                label="Linked Releases"
                items={releases}
                selected={(form.linked_release_ids ?? []) as string[]}
                onToggle={id => toggleArr('linked_release_ids', id)}
                renderItem={r => `${r.version} — ${r.name}`}
              />
              <LinkedMultiSelect<ADR>
                label="Linked ADRs"
                items={adrs}
                selected={(form.linked_adr_ids ?? []) as string[]}
                onToggle={id => toggleArr('linked_adr_ids', id)}
                renderItem={a => `${a.adr_number ? a.adr_number + ' — ' : ''}${a.title}`}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving…' : isNew ? 'Create Document' : 'Save Changes'}
          </button>
        </div>
      </aside>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ECCDocumentationPage() {
  const [docs, setDocs] = useState<DocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<string>('all');
  const [activeStatus, setActiveStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [drawerDoc, setDrawerDoc] = useState<DocRecord | null | 'new'>(null);
  const { addToActiveRC, logEvent } = useActiveRC();

  const [backlogItems, setBacklogItems] = useState<BacklogItem[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [adrs, setAdrs] = useState<ADR[]>([]);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: docData }, { data: backlogData }, { data: releaseData }, { data: adrData }] = await Promise.all([
      supabase.from('ecc_documentation').select('*').order('created_at', { ascending: false }),
      supabase.from('ecc_backlog_items').select('id, title').order('title'),
      supabase.from('ecc_releases').select('id, name, version').order('created_at', { ascending: false }),
      supabase.from('ecc_architecture_reviews').select('id, title, adr_number').order('created_at', { ascending: false }),
    ]);
    setDocs(docData ?? []);
    setBacklogItems(backlogData ?? []);
    setReleases(releaseData ?? []);
    setAdrs(adrData ?? []);
    setLoading(false);
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this document? This cannot be undone.')) return;
    await supabase.from('ecc_documentation').delete().eq('id', id);
    setDocs(d => d.filter(x => x.id !== id));
  }

  const filtered = docs.filter(d => {
    if (activeSection !== 'all' && d.doc_type !== activeSection) return false;
    if (activeStatus !== 'all' && d.status !== activeStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        d.title.toLowerCase().includes(q) ||
        (d.content ?? '').toLowerCase().includes(q) ||
        (d.author ?? '').toLowerCase().includes(q) ||
        (d.tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const countBySection = SECTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s.key] = docs.filter(d => d.doc_type === s.key).length;
    return acc;
  }, {});

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-blue-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Documentation Library</h1>
          </div>
          <p className="text-sm text-slate-500 ml-11">
            {docs.length} document{docs.length !== 1 ? 's' : ''} across {SECTIONS.filter(s => countBySection[s.key] > 0).length} sections
          </p>
        </div>
        <button
          onClick={() => setDrawerDoc('new')}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" /> New Document
        </button>
      </div>

      {/* Section cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const cnt = countBySection[s.key] ?? 0;
          const active = activeSection === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setActiveSection(active ? 'all' : s.key)}
              className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-all ${
                active
                  ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-white' : s.color}`} />
              <span className={`text-xs font-semibold leading-tight ${active ? 'text-white' : 'text-slate-900'}`}>{s.label}</span>
              <span className={`text-[10px] font-medium ${active ? 'text-blue-100' : 'text-slate-400'}`}>{cnt} doc{cnt !== 1 ? 's' : ''}</span>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
            placeholder="Search documents…"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {['all', ...Object.keys(STATUS_CFG)].map(s => {
            const cfg = STATUS_CFG[s];
            return (
              <button
                key={s}
                onClick={() => setActiveStatus(s)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  activeStatus === s
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                {cfg && <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />}
                {s === 'all' ? 'All' : cfg?.label ?? s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-slate-100 rounded w-3/4" />
                  <div className="h-2.5 bg-slate-100 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center">
          <FileText className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">
            {docs.length === 0 ? 'No documents yet' : 'No documents match your filters'}
          </p>
          {docs.length === 0 && (
            <button
              onClick={() => setDrawerDoc('new')}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Create first document
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(doc => (
            <DocCard key={doc.id} doc={doc} onEdit={d => setDrawerDoc(d)} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerDoc !== null && (
        <DocDrawer
          initial={drawerDoc === 'new' ? null : drawerDoc}
          onClose={() => setDrawerDoc(null)}
          onSave={async () => {
            setDrawerDoc(null);
            await loadAll();
            // After reload, the newest doc is first — link it to active RC if it was new
            const { data: newest } = await supabase.from('ecc_documentation').select('id,title').order('created_at', { ascending: false }).limit(1).single();
            if (newest && drawerDoc === 'new') {
              await addToActiveRC('doc', newest.id);
              await logEvent({ event_type: 'doc_created', event_label: `Document created: ${newest.title}`, entity_type: 'documentation', entity_id: newest.id, entity_title: newest.title });
            }
          }}
          backlogItems={backlogItems}
          releases={releases}
          adrs={adrs}
        />
      )}
    </div>
  );
}
