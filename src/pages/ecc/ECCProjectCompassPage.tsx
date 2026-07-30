import { useEffect, useState } from 'react';
import { Loader2, Pencil, Check, X, Compass } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CompassSection {
  id: string;
  section_key: string;
  section_title: string;
  content: string;
  sort_order: number;
}

const SECTION_HINTS: Record<string, string> = {
  mission:                  'What does LLND Automate exist to do? (one sentence)',
  vision:                   'What does the world look like when we succeed?',
  problem_being_solved:     'What specific pain are we solving for RTOs and learners?',
  target_customer:          'Who is the primary buyer? Who is the primary user?',
  core_differentiators:     'What makes LLND Automate different from existing solutions?',
  mvp_scope:                'What features are in scope for the initial launch?',
  current_launch_blockers:  'What must be resolved before we can go live?',
  current_phase:            'Which development stage is currently active?',
  current_release_candidate:'What is the current RC number and status?',
  current_priorities:       'What are the top 3–5 items being worked on right now?',
  next_three_priorities:    'What comes immediately after the current phase?',
  long_term_roadmap_summary:'High-level view of features planned beyond MVP.',
  pricing_strategy_summary: 'How will LLND Automate be priced? Tiers, billing model.',
  success_metrics:          'How will we know the product is working? Adoption, retention, outcomes.',
  launch_checklist_summary: 'Final checklist items before going live.',
};

function CompassSectionCard({ section, onSave }: {
  section: CompassSection;
  onSave: (key: string, content: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section.content);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave(section.section_key, draft);
    setSaving(false);
    setEditing(false);
  }

  function handleCancel() {
    setDraft(section.content);
    setEditing(false);
  }

  const isEmpty = !section.content.trim();
  const hint = SECTION_HINTS[section.section_key];

  return (
    <div className={`bg-white rounded-xl border transition-all ${editing ? 'border-slate-400 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">{section.section_title}</h3>
        {!editing && (
          <button onClick={() => { setDraft(section.content); setEditing(true); }}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-50">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {editing ? (
          <>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={hint}
              autoFocus
              rows={Math.max(3, (draft.split('\n').length + 1))}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800/10 focus:border-slate-400 resize-y bg-white placeholder-slate-300 leading-relaxed"
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <button onClick={handleCancel} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5 rounded">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
          </>
        ) : isEmpty ? (
          <button onClick={() => { setDraft(''); setEditing(true); }}
            className="w-full py-4 text-sm text-slate-300 border-2 border-dashed border-slate-200 rounded-lg hover:border-slate-300 hover:text-slate-400 transition-all">
            {hint ?? 'Click to add content…'}
          </button>
        ) : (
          <pre className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap font-sans">{section.content}</pre>
        )}
      </div>
    </div>
  );
}

export function ECCProjectCompassPage() {
  const [sections, setSections] = useState<CompassSection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('ecc_project_compass').select('*').order('sort_order')
      .then(({ data }) => { setSections(data ?? []); setLoading(false); });
  }, []);

  async function handleSave(key: string, content: string) {
    const now = new Date().toISOString();
    await supabase.from('ecc_project_compass').update({ content, updated_at: now }).eq('section_key', key);
    setSections(ss => ss.map(s => s.section_key === key ? { ...s, content } : s));
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
    </div>
  );

  const grouped: Array<{ heading: string; keys: string[] }> = [
    { heading: 'Project Identity',   keys: ['mission','vision','problem_being_solved','target_customer','core_differentiators'] },
    { heading: 'Scope & Roadmap',    keys: ['mvp_scope','long_term_roadmap_summary','pricing_strategy_summary'] },
    { heading: 'Current Status',     keys: ['current_phase','current_release_candidate','current_launch_blockers','current_priorities','next_three_priorities'] },
    { heading: 'Launch Readiness',   keys: ['success_metrics','launch_checklist_summary'] },
  ];

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center">
          <Compass className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Project Compass</h2>
          <p className="text-sm text-slate-500">Re-orient in under two minutes. Click any section to edit.</p>
        </div>
      </div>

      <div className="space-y-8">
        {grouped.map(group => {
          const groupSections = group.keys
            .map(k => sections.find(s => s.section_key === k))
            .filter(Boolean) as CompassSection[];
          if (groupSections.length === 0) return null;
          return (
            <div key={group.heading}>
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3 pl-1">{group.heading}</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {groupSections.map(s => (
                  <CompassSectionCard key={s.section_key} section={s} onSave={handleSave} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
