import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useActiveRC } from '../../lib/activeRC';
import {
  X, ChevronRight, ChevronLeft, Rocket, Package, Brain,
  FileText, CheckCircle2, Plus, Trash2, Loader2, Sparkles, AlertTriangle,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardProps {
  onClose: () => void;
  onComplete: () => void;
}

interface BacklogOption {
  id: string;
  title: string;
  priority: string;
  status: string;
}

interface NewBacklogItem {
  title: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

const DEFAULT_CHECKLIST = [
  { id: 'bl',         label: 'Backlog Complete',                required: true,  checked: false },
  { id: 'build',      label: 'Build Successful',                required: true,  checked: false },
  { id: 'ts',         label: 'TypeScript Clean',                required: false, checked: false },
  { id: 'manual',     label: 'Manual Testing Completed',        required: true,  checked: false },
  { id: 'regression', label: 'Regression Testing Completed',    required: false, checked: false },
  { id: 'edge',       label: 'Edge Cases Tested',               required: false, checked: false },
  { id: 'sql',        label: 'SQL Validation Completed',        required: false, checked: false },
  { id: 'docs',       label: 'Documentation Updated',           required: true,  checked: false },
  { id: 'adr',        label: 'ADR Linked (if required)',        required: false, checked: false },
  { id: 'journal',    label: 'AI Journal Updated',              required: true,  checked: false },
  { id: 'report',     label: 'Completion Report Generated',     required: true,  checked: false },
  { id: 'prod',       label: 'Ready for Production',            required: true,  checked: false },
];

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDot({ step, active, done }: { step: number; active: boolean; done: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
      done   ? 'bg-emerald-500 border-emerald-500 text-white' :
      active ? 'bg-blue-600 border-blue-600 text-white' :
               'bg-white border-slate-200 text-slate-400'
    }`}>
      {done ? <CheckCircle2 className="w-4 h-4" /> : step}
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export function ECCStartPhaseWizard({ onClose, onComplete }: WizardProps) {
  const { refresh } = useActiveRC();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Block state — if an active RC exists, block the wizard
  const [blockingRC, setBlockingRC] = useState<{ rc_number: string; phase_name: string } | null | undefined>(undefined);

  // Step 1 — Phase details
  const [phaseName,   setPhaseName]   = useState('');
  const [version,     setVersion]     = useState('');
  const [description, setDescription] = useState('');
  const [milestone,   setMilestone]   = useState('');
  const [dueDate,     setDueDate]     = useState('');
  const [owner,       setOwner]       = useState('');

  // Step 2 — Backlog items
  const [existingItems, setExistingItems] = useState<BacklogOption[]>([]);
  const [selectedIds, setSelectedIds]     = useState<string[]>([]);
  const [newItems, setNewItems]           = useState<NewBacklogItem[]>([]);
  const [loadingBacklog, setLoadingBacklog] = useState(false);
  const [backlogSearch, setBacklogSearch]   = useState('');

  const STEPS = ['Phase Details', 'Backlog Items', 'Review & Launch'];

  // Check for active RC on mount — block if one exists
  useEffect(() => {
    supabase
      .from('ecc_release_candidates')
      .select('rc_number,phase_name')
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => {
        setBlockingRC(data ?? null);
      });
  }, []);

  // Auto-suggest next RC number
  useEffect(() => {
    supabase.from('ecc_release_candidates')
      .select('rc_number')
      .order('rc_number', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const last = parseInt(data[0].rc_number.replace('RC-', ''), 10);
          if (!isNaN(last)) setPhaseName(`Phase ${last + 1}`);
        } else {
          setPhaseName('Phase 1');
        }
      });
  }, []);

  // Load backlog items when arriving at step 2
  useEffect(() => {
    if (step !== 2) return;
    setLoadingBacklog(true);
    supabase.from('ecc_backlog_items')
      .select('id,title,priority,status')
      .not('status', 'in', '("released","archived")')
      .order('priority', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setExistingItems(data ?? []);
        setLoadingBacklog(false);
      });
  }, [step]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function addNewItem() {
    setNewItems(prev => [...prev, { title: '', priority: 'medium' }]);
  }

  function removeNewItem(i: number) {
    setNewItems(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateNewItem(i: number, field: keyof NewBacklogItem, val: string) {
    setNewItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: val } : item));
  }

  const step1Valid = phaseName.trim().length > 0;

  async function handleLaunch() {
    setSaving(true);
    setError(null);
    try {
      // Guard: re-check active RC (idempotency)
      const { data: existingActive } = await supabase
        .from('ecc_release_candidates')
        .select('id')
        .eq('is_active', true)
        .maybeSingle();
      if (existingActive) {
        throw new Error('Another Release Candidate is currently active. Please verify, archive or deactivate it before starting another phase.');
      }

      // Determine next RC number
      const { data: rcData } = await supabase
        .from('ecc_release_candidates')
        .select('rc_number')
        .order('rc_number', { ascending: false })
        .limit(1);
      let nextNum = 1;
      if (rcData && rcData.length > 0) {
        const last = parseInt(rcData[0].rc_number.replace('RC-', ''), 10);
        if (!isNaN(last)) nextNum = last + 1;
      }
      const rcNumber = `RC-${String(nextNum).padStart(3, '0')}`;

      // Create new backlog items
      const createdBacklogIds: string[] = [];
      for (const item of newItems.filter(i => i.title.trim())) {
        const { data: bl } = await supabase
          .from('ecc_backlog_items')
          .insert({ title: item.title.trim(), priority: item.priority, status: 'ideas', position: 0 })
          .select('id')
          .single();
        if (bl) createdBacklogIds.push(bl.id);
      }

      const allBacklogIds = [...selectedIds, ...createdBacklogIds];
      const now = new Date().toISOString();

      // Move "ready" backlog items to "in_progress"
      const readySelected = existingItems.filter(i => selectedIds.includes(i.id) && i.status === 'ready');
      if (readySelected.length > 0) {
        await supabase
          .from('ecc_backlog_items')
          .update({ status: 'in_progress', updated_at: now })
          .in('id', readySelected.map(i => i.id));
      }

      // Create the Release Candidate
      const { data: rc, error: rcErr } = await supabase
        .from('ecc_release_candidates')
        .insert({
          rc_number:                 rcNumber,
          phase_name:                phaseName.trim(),
          version:                   version.trim() || null,
          description:               description.trim() || null,
          milestone:                 milestone.trim() || null,
          due_date:                  dueDate || null,
          owner:                     owner.trim() || null,
          status:                    'in_progress',
          is_active:                 true,
          included_backlog_item_ids: allBacklogIds,
          checklist_items:           DEFAULT_CHECKLIST,
          linked_journal_ids:        [],
          linked_testing_ids:        [],
          linked_adr_ids:            [],
          linked_doc_ids:            [],
        })
        .select('id,rc_number')
        .single();
      if (rcErr) throw new Error(rcErr.message);
      const rcId = rc!.id;

      // Back-link RC to all selected/created backlog items
      if (allBacklogIds.length > 0) {
        const { data: blRows } = await supabase
          .from('ecc_backlog_items')
          .select('id,linked_release_ids')
          .in('id', allBacklogIds);
        if (blRows) {
          for (const row of blRows) {
            const existing = (row.linked_release_ids as string[]) ?? [];
            if (!existing.includes(rcId)) {
              await supabase
                .from('ecc_backlog_items')
                .update({ linked_release_ids: [...existing, rcId], updated_at: now })
                .eq('id', row.id);
            }
          }
        }
      }

      // Create AI Journal session placeholder
      const { data: journal } = await supabase
        .from('ecc_ai_journal')
        .insert({
          title:        `${phaseName.trim()} — AI Collaboration Session`,
          session_date: now.split('T')[0],
          ai_platform:  'Claude',
          objective:    `AI collaboration session for ${phaseName.trim()}${version ? ` (${version})` : ''}`,
          tags:         [phaseName.trim().toLowerCase().replace(/\s+/g, '-')],
          linked_rc_ids: [rcId],
        })
        .select('id')
        .single();

      // Create Testing Report placeholder
      const { data: testReport } = await supabase
        .from('ecc_testing_reports')
        .insert({
          title:             `${phaseName.trim()} — Testing Report`,
          test_date:         now.split('T')[0],
          environment:       'production',
          test_type:         'manual',
          result:            'pending',
          summary:           `Testing for ${phaseName.trim()}${version ? ` (${version})` : ''}`,
          phase:             phaseName.trim(),
          linked_release_ids: [rcId],
        })
        .select('id')
        .single();

      const versionDisplay = version ? (version.startsWith('v') ? version : `v${version}`) : null;
      const reportTitle = `EOC Phase Completion Report — ${phaseName.trim()}${versionDisplay ? ` (${versionDisplay})` : ''}`;

      // Create Completion Report placeholder doc
      const { data: doc } = await supabase
        .from('ecc_documentation')
        .insert({
          title:             reportTitle,
          doc_type:          'operations',
          status:            'draft',
          tags:              ['build-history', 'completion-report', phaseName.trim().toLowerCase().replace(/\s+/g, '-')],
          content:           `# ${reportTitle}\n\n## Overview\n\n**Phase:** ${phaseName.trim()}\n**Version:** ${version || 'TBD'}\n**Milestone:** ${milestone || 'TBD'}\n**Status:** In Progress\n\n---\n\n## Functionality Added\n\n_To be completed during implementation._\n\n## Database Changes\n\n_To be completed during implementation._\n\n## Application Changes\n\n_To be completed during implementation._\n\n## Engineering Decisions\n\n_To be completed during implementation._\n\n## AI Collaboration Summary\n\n_To be completed after AI sessions._\n\n## Manual Testing\n\n_To be completed after testing._\n\n## Lessons Learned\n\n_To be completed at close of phase._`,
          version:           versionDisplay,
          author:            owner.trim() || 'Engineering',
          linked_release_ids: [rcId],
        })
        .select('id')
        .single();

      // Update RC with linked artifact IDs
      const journalIds = journal    ? [journal.id]    : [];
      const testingIds = testReport ? [testReport.id] : [];
      const docIds     = doc        ? [doc.id]        : [];

      await supabase.from('ecc_release_candidates')
        .update({
          linked_journal_ids: journalIds,
          linked_testing_ids: testingIds,
          linked_doc_ids:     docIds,
          updated_at:         now,
        })
        .eq('id', rcId);

      // Log audit event
      await supabase.from('ecc_engineering_audit').insert({
        event_type:   'phase_started',
        event_label:  `Phase started: ${phaseName.trim()} (${rcNumber})`,
        entity_type:  'release_candidate',
        entity_id:    rcId,
        entity_title: rcNumber,
        rc_id:        rcId,
        rc_number:    rcNumber,
        metadata: {
          version,
          milestone,
          owner: owner.trim() || null,
          due_date:      dueDate,
          backlog_count: allBacklogIds.length,
          new_backlog:   createdBacklogIds.length,
          ready_moved:   readySelected.length,
        },
      });

      await refresh();
      onComplete();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start phase');
    } finally {
      setSaving(false);
    }
  }

  const filteredExisting = existingItems.filter(i =>
    !backlogSearch || i.title.toLowerCase().includes(backlogSearch.toLowerCase())
  );

  const PRIORITY_DOT: Record<string, string> = {
    critical: 'bg-red-500', high: 'bg-amber-500', medium: 'bg-blue-500', low: 'bg-slate-400',
  };

  // Still checking for active RC
  if (blockingRC === undefined) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
          <span className="text-sm text-slate-600">Checking system state…</span>
        </div>
      </div>
    );
  }

  // Active RC exists — block with clear message
  if (blockingRC !== null) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
            <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">Active RC Exists</h2>
              <p className="text-xs text-slate-500 mt-0.5">Cannot start a new phase</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">
                {blockingRC.rc_number} — {blockingRC.phase_name}
              </p>
              <p className="text-xs text-amber-700">
                Another Release Candidate is currently active. Please verify, archive or deactivate it before starting another phase.
              </p>
            </div>
            <p className="text-xs text-slate-500">
              Navigate to the Release Centre to manage the active RC before launching a new phase.
            </p>
          </div>
          <div className="flex justify-end px-6 py-4 border-t border-slate-100 bg-slate-50/60">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <Rocket className="w-4.5 h-4.5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-slate-900">Start New Phase</h2>
            <p className="text-xs text-slate-500 mt-0.5">Creates RC, Journal, Testing Report and Completion Report placeholder automatically</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          {STEPS.map((label, i) => {
            const s = i + 1;
            return (
              <div key={s} className="flex items-center gap-2 flex-1">
                <StepDot step={s} active={step === s} done={step > s} />
                <span className={`text-xs font-medium truncate ${step === s ? 'text-blue-700' : step > s ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${step > s ? 'bg-emerald-300' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── Step 1: Phase Details ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Name <span className="text-red-500">*</span></label>
                  <input
                    value={phaseName}
                    onChange={e => setPhaseName(e.target.value)}
                    placeholder="e.g. Phase 3 — Workflow Automation"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Version</label>
                  <input
                    value={version}
                    onChange={e => setVersion(e.target.value)}
                    placeholder="e.g. v0.3.0"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Owner</label>
                  <input
                    value={owner}
                    onChange={e => setOwner(e.target.value)}
                    placeholder="e.g. Engineering"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Milestone</label>
                  <input
                    value={milestone}
                    onChange={e => setMilestone(e.target.value)}
                    placeholder="e.g. M3 — Engineering OS"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Brief description of what this phase delivers..."
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Target Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                />
              </div>

              {/* What gets created automatically */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-blue-700 mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Automatically created on launch
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: Package,      label: 'Release Candidate' },
                    { icon: Brain,        label: 'AI Journal Session' },
                    { icon: CheckCircle2, label: 'Testing Report' },
                    { icon: FileText,     label: 'Completion Report Draft' },
                  ].map(({ icon: Icon, label }) => (
                    <div key={label} className="flex items-center gap-2 text-xs text-blue-700">
                      <Icon className="w-3.5 h-3.5 shrink-0" />{label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Backlog Items ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Select existing backlog items to include</p>
                <span className="text-xs text-slate-400">{selectedIds.length} selected</span>
              </div>

              <input
                value={backlogSearch}
                onChange={e => setBacklogSearch(e.target.value)}
                placeholder="Search backlog..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />

              {loadingBacklog ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                </div>
              ) : (
                <div className="max-h-52 overflow-y-auto space-y-1 border border-slate-100 rounded-xl p-2">
                  {filteredExisting.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">No backlog items found</p>
                  )}
                  {filteredExisting.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleSelect(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                        selectedIds.includes(item.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                        selectedIds.includes(item.id) ? 'bg-blue-600 border-blue-600' : 'border-slate-300'
                      }`}>
                        {selectedIds.includes(item.id) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority] ?? 'bg-slate-400'}`} />
                      <span className="text-xs text-slate-700 flex-1 truncate">{item.title}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{item.status}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-slate-800">Create new backlog items</p>
                  <button onClick={addNewItem} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Add item
                  </button>
                </div>
                {newItems.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No new items — click "Add item" to create backlog items for this phase</p>
                )}
                <div className="space-y-2">
                  {newItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={item.title}
                        onChange={e => updateNewItem(i, 'title', e.target.value)}
                        placeholder="Backlog item title..."
                        className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                      />
                      <select
                        value={item.priority}
                        onChange={e => updateNewItem(i, 'priority', e.target.value)}
                        className="px-2 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <button onClick={() => removeNewItem(i)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Phase Summary</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                  <div><span className="text-slate-500">Phase Name</span><p className="font-semibold text-slate-800 mt-0.5">{phaseName}</p></div>
                  <div><span className="text-slate-500">Version</span><p className="font-semibold text-slate-800 mt-0.5">{version || '—'}</p></div>
                  <div><span className="text-slate-500">Owner</span><p className="font-semibold text-slate-800 mt-0.5">{owner || '—'}</p></div>
                  <div><span className="text-slate-500">Milestone</span><p className="font-semibold text-slate-800 mt-0.5">{milestone || '—'}</p></div>
                  <div><span className="text-slate-500">Target Date</span><p className="font-semibold text-slate-800 mt-0.5">{dueDate || '—'}</p></div>
                </div>
                {description && <p className="text-xs text-slate-600 border-t border-slate-200 pt-3">{description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">Backlog Items</p>
                  <p className="text-2xl font-bold text-blue-800">{selectedIds.length + newItems.filter(i => i.title.trim()).length}</p>
                  <p className="text-xs text-blue-500 mt-0.5">
                    {selectedIds.length} existing · {newItems.filter(i => i.title.trim()).length} new
                  </p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-emerald-700 mb-1">Auto-created</p>
                  <p className="text-2xl font-bold text-emerald-800">4</p>
                  <p className="text-xs text-emerald-500 mt-0.5">RC · Journal · Test · Report</p>
                </div>
              </div>

              {existingItems.filter(i => selectedIds.includes(i.id) && i.status === 'ready').length > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700">
                    {existingItems.filter(i => selectedIds.includes(i.id) && i.status === 'ready').length} "ready" item{existingItems.filter(i => selectedIds.includes(i.id) && i.status === 'ready').length > 1 ? 's' : ''} will be moved to "in_progress" on launch
                  </p>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <p className="text-xs font-semibold text-amber-700 mb-2">Release Readiness Checklist will be pre-loaded with 12 items</p>
                <div className="space-y-1">
                  {DEFAULT_CHECKLIST.filter(c => c.required).map(c => (
                    <div key={c.id} className="flex items-center gap-2 text-xs text-amber-700">
                      <div className="w-3.5 h-3.5 border-2 border-amber-400 rounded flex-shrink-0" />
                      {c.label} <span className="text-amber-500">(required)</span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={step === 1 ? onClose : () => setStep(s => s - 1)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !step1Valid}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleLaunch}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              {saving ? 'Launching…' : 'Launch Phase'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
