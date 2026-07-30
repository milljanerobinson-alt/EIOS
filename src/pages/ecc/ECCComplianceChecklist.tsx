import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Plus, Loader2,
  ChevronDown, ChevronUp, RefreshCw, Shield, Check, X, Info,
  FileText, Lock, Layers, Activity, Zap, BarChart3, AlertCircle,
  BookOpen, Server,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistTemplateItem {
  id: string;
  template_id: string;
  sort_order: number;
  category: string;
  title: string;
  description: string | null;
  acceptance_criteria: string | null;
  item_type: string;
  allows_defer: boolean;
  allows_exception: boolean;
}

interface ChecklistTemplate {
  id: string;
  template_number: string;
  name: string;
  description: string | null;
  template_type: string;
  version: number;
  status: string;
  total_items: number;
  mandatory_items: number;
  created_by: string | null;
  created_at: string;
}

interface ComplianceItem {
  item_id: string;
  title: string;
  category: string;
  item_type: string;
  status: 'not_started' | 'pass' | 'fail' | 'deferred' | 'exception' | 'na';
  evidence: string;
  notes: string;
  allows_defer: boolean;
  allows_exception: boolean;
  acceptance_criteria: string;
}

interface ComplianceVersion {
  id: string;
  version_number: string;
  linked_rc: string | null;
  status: string;
  sign_off_date: string | null;
  sign_off_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  template_id: string | null;
  total_items: number;
  passed_items: number;
  failed_items: number;
  deferred_items: number;
  exception_items: number;
  items: ComplianceItem[];
  created_at: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ITEM_STATUS_CFG: Record<string, { label: string; icon: typeof Check; dot: string; text: string; bg: string }> = {
  not_started: { label: 'Not Started', icon: Clock,         dot: 'bg-slate-400',  text: 'text-slate-500',  bg: 'bg-slate-100'  },
  pass:        { label: 'Pass',        icon: CheckCircle2,  dot: 'bg-emerald-500',text: 'text-emerald-700',bg: 'bg-emerald-50' },
  fail:        { label: 'Fail',        icon: XCircle,       dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50'     },
  deferred:    { label: 'Deferred',    icon: Clock,         dot: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50'   },
  exception:   { label: 'Exception',   icon: AlertTriangle, dot: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50'  },
  na:          { label: 'N/A',         icon: X,             dot: 'bg-slate-300',  text: 'text-slate-400',  bg: 'bg-slate-100'  },
};

const CATEGORY_ICONS: Record<string, typeof Shield> = {
  'Testing':           BarChart3,
  'Documentation':     BookOpen,
  'Security':          Shield,
  'Deployment':        Server,
  'Compliance':        FileText,
  'AI Infrastructure': Zap,
  'Monitoring':        Activity,
  'General':           Layers,
};

const ITEM_TYPE_CFG: Record<string, { label: string; color: string }> = {
  mandatory:   { label: 'Mandatory',   color: 'text-red-600 bg-red-50 border-red-200'     },
  optional:    { label: 'Optional',    color: 'text-slate-500 bg-slate-100 border-slate-200' },
  conditional: { label: 'Conditional', color: 'text-amber-600 bg-amber-50 border-amber-200' },
};

// ─── Checklist Item Row ───────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  onChange,
  locked,
}: {
  item: ComplianceItem;
  index: number;
  onChange: (i: number, field: keyof ComplianceItem, value: string) => void;
  locked: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = ITEM_STATUS_CFG[item.status] ?? ITEM_STATUS_CFG.not_started;
  const StatusIcon = cfg.icon;
  const typeCfg = ITEM_TYPE_CFG[item.item_type] ?? ITEM_TYPE_CFG.optional;
  const CatIcon = CATEGORY_ICONS[item.category] ?? Layers;

  const statusOptions = ['not_started', 'pass', 'fail',
    ...(item.allows_defer ? ['deferred'] : []),
    ...(item.allows_exception ? ['exception'] : []),
    'na',
  ];

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      item.status === 'pass' ? 'border-emerald-200 bg-emerald-50/30' :
      item.status === 'fail' ? 'border-red-200 bg-red-50/30' :
      item.status === 'deferred' ? 'border-amber-200 bg-amber-50/20' :
      item.status === 'exception' ? 'border-violet-200 bg-violet-50/20' :
      'border-slate-200 bg-white'
    }`}>
      <div className="flex items-start gap-3 px-4 py-3">
        {/* Status indicator */}
        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
          <StatusIcon className={`w-3.5 h-3.5 ${cfg.text}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs text-slate-400 font-mono">{item.category}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${typeCfg.color}`}>
              {typeCfg.label}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!locked && (
            <select
              value={item.status}
              onChange={e => onChange(index, 'status', e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              {statusOptions.map(s => (
                <option key={s} value={s}>{ITEM_STATUS_CFG[s]?.label ?? s}</option>
              ))}
            </select>
          )}
          <button onClick={() => setExpanded(e => !e)} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 pt-0 space-y-3 border-t border-slate-100">
          {item.acceptance_criteria && (
            <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg">
              <Info className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <p className="text-xs text-slate-600">{item.acceptance_criteria}</p>
            </div>
          )}
          {!locked && (
            <>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Evidence</label>
                <input
                  value={item.evidence}
                  onChange={e => onChange(index, 'evidence', e.target.value)}
                  placeholder="Link, screenshot, or description of evidence…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
                <textarea
                  value={item.notes}
                  onChange={e => onChange(index, 'notes', e.target.value)}
                  rows={2}
                  placeholder="Additional notes…"
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                />
              </div>
            </>
          )}
          {locked && item.evidence && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Evidence</p>
              <p className="text-xs text-slate-600">{item.evidence}</p>
            </div>
          )}
          {locked && item.notes && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-xs text-slate-600">{item.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({ category, items, startIndex, onChange, locked }: {
  category: string;
  items: Array<ComplianceItem & { globalIndex: number }>;
  startIndex: number;
  onChange: (i: number, field: keyof ComplianceItem, value: string) => void;
  locked: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const CatIcon = CATEGORY_ICONS[category] ?? Layers;
  const passCount  = items.filter(i => i.status === 'pass').length;
  const failCount  = items.filter(i => i.status === 'fail').length;
  const pendCount  = items.filter(i => i.status === 'not_started').length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <CatIcon className="w-4 h-4 text-slate-600 shrink-0" />
        <span className="text-sm font-bold text-slate-800 flex-1 text-left">{category}</span>
        <div className="flex items-center gap-1.5">
          {passCount > 0  && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">{passCount} pass</span>}
          {failCount > 0  && <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">{failCount} fail</span>}
          {pendCount > 0  && <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{pendCount} pending</span>}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 space-y-2 border-t border-slate-100">
          {items.map(item => (
            <ItemRow
              key={item.item_id}
              item={item}
              index={item.globalIndex}
              onChange={onChange}
              locked={locked}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function ECCComplianceChecklist({ linkedRc }: { linkedRc?: string }) {
  const [template, setTemplate]     = useState<ChecklistTemplate | null>(null);
  const [templateItems, setTemplateItems] = useState<ChecklistTemplateItem[]>([]);
  const [versions, setVersions]     = useState<ComplianceVersion[]>([]);
  const [activeVersion, setActiveVersion] = useState<ComplianceVersion | null>(null);
  const [items, setItems]           = useState<ComplianceItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [creating, setCreating]     = useState(false);
  const [newRcRef, setNewRcRef]     = useState(linkedRc ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: tmpl }, { data: vers }] = await Promise.all([
      supabase.from('ecc_checklist_templates').select('*').eq('template_number', 'CHK-001').maybeSingle(),
      supabase.from('ecc_compliance_versions').select('*').order('created_at', { ascending: false }),
    ]);

    setTemplate(tmpl ?? null);

    if (tmpl) {
      const { data: ti } = await supabase
        .from('ecc_checklist_template_items')
        .select('*')
        .eq('template_id', tmpl.id)
        .order('sort_order');
      setTemplateItems(ti ?? []);
    }

    const allVers = vers ?? [];
    setVersions(allVers);

    // Auto-select: linked RC first, then most recent
    const target = linkedRc
      ? allVers.find(v => v.linked_rc === linkedRc) ?? allVers[0]
      : allVers[0];

    if (target) {
      setActiveVersion(target);
      setItems(Array.isArray(target.items) ? target.items : []);
    }
    setLoading(false);
  }, [linkedRc]);

  useEffect(() => { load(); }, [load]);

  function selectVersion(v: ComplianceVersion) {
    setActiveVersion(v);
    setItems(Array.isArray(v.items) ? v.items : []);
  }

  async function createVersion() {
    if (!template || templateItems.length === 0) return;
    setCreating(true);

    const newItems: ComplianceItem[] = templateItems.map(ti => ({
      item_id: ti.id,
      title: ti.title,
      category: ti.category,
      item_type: ti.item_type,
      status: 'not_started' as const,
      evidence: '',
      notes: '',
      allows_defer: ti.allows_defer,
      allows_exception: ti.allows_exception,
      acceptance_criteria: ti.acceptance_criteria ?? '',
    }));

    const versionNumber = `V${Date.now().toString().slice(-6)}`;
    const { data: newVer } = await supabase
      .from('ecc_compliance_versions')
      .insert({
        version_number: versionNumber,
        linked_rc: newRcRef || null,
        status: 'draft',
        template_id: template.id,
        total_items: newItems.length,
        passed_items: 0,
        failed_items: 0,
        deferred_items: 0,
        exception_items: 0,
        items: newItems,
      })
      .select()
      .single();

    setCreating(false);
    if (newVer) {
      setVersions(vs => [newVer, ...vs]);
      setActiveVersion(newVer);
      setItems(newItems);
    }
  }

  function handleItemChange(index: number, field: keyof ComplianceItem, value: string) {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  }

  async function saveProgress() {
    if (!activeVersion) return;
    setSaving(true);

    const passedItems  = items.filter(i => i.status === 'pass').length;
    const failedItems  = items.filter(i => i.status === 'fail').length;
    const deferredItems = items.filter(i => i.status === 'deferred').length;
    const exceptionItems = items.filter(i => i.status === 'exception').length;

    const allMandatoryDone = items
      .filter(i => i.item_type === 'mandatory')
      .every(i => ['pass', 'exception', 'deferred', 'na'].includes(i.status));

    const newStatus = allMandatoryDone && failedItems === 0 ? 'approved' :
                      passedItems > 0 ? 'in_progress' : 'draft';

    await supabase.from('ecc_compliance_versions').update({
      items,
      total_items: items.length,
      passed_items: passedItems,
      failed_items: failedItems,
      deferred_items: deferredItems,
      exception_items: exceptionItems,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }).eq('id', activeVersion.id);

    setActiveVersion(v => v ? { ...v, status: newStatus, passed_items: passedItems, failed_items: failedItems, deferred_items: deferredItems, exception_items: exceptionItems, total_items: items.length } : v);
    setSaving(false);
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  const totalItems     = items.length;
  const passedItems    = items.filter(i => i.status === 'pass').length;
  const failedItems    = items.filter(i => i.status === 'fail').length;
  const pendingItems   = items.filter(i => i.status === 'not_started').length;
  const deferredItems  = items.filter(i => i.status === 'deferred').length;
  const mandatoryFail  = items.filter(i => i.item_type === 'mandatory' && i.status === 'fail').length;
  const mandatoryPend  = items.filter(i => i.item_type === 'mandatory' && i.status === 'not_started').length;
  const progress       = totalItems > 0 ? Math.round((passedItems / totalItems) * 100) : 0;
  const isLocked       = activeVersion?.status === 'approved' || activeVersion?.status === 'signed_off';

  // Group items by category
  const byCategory = items.reduce<Record<string, Array<ComplianceItem & { globalIndex: number }>>>((acc, item, idx) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push({ ...item, globalIndex: idx });
    return acc;
  }, {});

  const categoryOrder = ['Testing', 'Documentation', 'Security', 'Deployment', 'Compliance', 'AI Infrastructure', 'Monitoring', 'General'];
  const sortedCategories = [
    ...categoryOrder.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !categoryOrder.includes(c)),
  ];

  if (loading) return (
    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Release Readiness Checklist</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Based on {template?.template_number ?? 'CHK-001'} — {template?.name ?? 'Standard Release Readiness Checklist'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          {template && (
            <button onClick={createVersion}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors">
              <Plus className="w-3.5 h-3.5" /> New Version
            </button>
          )}
        </div>
      </div>

      {/* Version selector */}
      {versions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {versions.map(v => {
            const isActive = activeVersion?.id === v.id;
            const isApproved = v.status === 'approved';
            return (
              <button
                key={v.id}
                onClick={() => selectVersion(v)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : isApproved
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {isApproved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                {v.version_number}
                {v.linked_rc && <span className="opacity-70">· {v.linked_rc}</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* No versions yet */}
      {versions.length === 0 && (
        <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-center">
          <FileText className="w-8 h-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-700 mb-1">No checklist versions yet</p>
          <p className="text-xs text-slate-400 mb-4">Create a version to begin the Release Readiness Assessment for this release.</p>
          <div className="flex items-center gap-2 justify-center">
            <input
              value={newRcRef}
              onChange={e => setNewRcRef(e.target.value)}
              placeholder="RC reference (e.g. RC-003)"
              className="text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
            />
            <button onClick={createVersion}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition-colors">
              <Plus className="w-3.5 h-3.5" /> Create Checklist
            </button>
          </div>
        </div>
      )}

      {/* Active version */}
      {activeVersion && items.length > 0 && (
        <>
          {/* Progress summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-800">
                  {activeVersion.version_number}
                  {activeVersion.linked_rc && ` — ${activeVersion.linked_rc}`}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeVersion.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                  activeVersion.status === 'in_progress' ? 'bg-blue-50 text-blue-700' :
                  'bg-slate-100 text-slate-500'
                }`}>
                  {activeVersion.status === 'approved' ? 'Approved' :
                   activeVersion.status === 'in_progress' ? 'In Progress' : 'Draft'}
                </span>
                {isLocked && <Lock className="w-3.5 h-3.5 text-slate-400" />}
              </div>
              <span className="text-lg font-bold text-slate-800">{progress}%</span>
            </div>

            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[
                { label: 'Pass',      val: passedItems,   color: 'text-emerald-600' },
                { label: 'Fail',      val: failedItems,   color: failedItems > 0 ? 'text-red-600' : 'text-slate-400' },
                { label: 'Pending',   val: pendingItems,  color: pendingItems > 0 ? 'text-amber-600' : 'text-slate-400' },
                { label: 'Deferred',  val: deferredItems, color: 'text-violet-600' },
                { label: 'Total',     val: totalItems,    color: 'text-slate-700' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className={`text-base font-bold ${s.color}`}>{s.val}</p>
                  <p className="text-[10px] text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Blocker alerts */}
            {mandatoryFail > 0 && (
              <div className="flex items-start gap-2 mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                <p className="text-xs text-red-800 font-semibold">{mandatoryFail} mandatory item{mandatoryFail !== 1 ? 's' : ''} failing — release blocked until resolved.</p>
              </div>
            )}
            {mandatoryPend > 0 && !mandatoryFail && (
              <div className="flex items-start gap-2 mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-800">{mandatoryPend} mandatory item{mandatoryPend !== 1 ? 's' : ''} not yet assessed.</p>
              </div>
            )}
            {progress === 100 && failedItems === 0 && (
              <div className="flex items-start gap-2 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                <p className="text-xs text-emerald-800 font-semibold">All items assessed. Release Readiness Checklist complete.</p>
              </div>
            )}
          </div>

          {/* Checklist items by category */}
          <div className="space-y-3">
            {sortedCategories.map(cat => (
              <CategorySection
                key={cat}
                category={cat}
                items={byCategory[cat]}
                startIndex={0}
                onChange={handleItemChange}
                locked={isLocked}
              />
            ))}
          </div>

          {/* Save button */}
          {!isLocked && (
            <div className="flex items-center gap-3 pt-2">
              <button onClick={saveProgress} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Progress
              </button>
              <p className="text-xs text-slate-400">
                {mandatoryFail === 0 && mandatoryPend === 0
                  ? 'All mandatory items addressed — saving will mark as Approved.'
                  : 'Progress saved as draft until all mandatory items are addressed.'}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
