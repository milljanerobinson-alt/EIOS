import { useState, useEffect, useCallback } from 'react';
import { Brain, MapPin } from 'lucide-react';
import { EAEEPage } from './EAEEPage';
import { MappingEvidencePage } from './MappingEvidencePage';
import { supabase } from '../lib/supabase';
import { Loader2, Award } from 'lucide-react';

type TopTab = 'engine' | 'record';

interface QualRow {
  id: string;
  code: string;
  name: string;
}

function QualificationPicker({ onSelect }: { onSelect: (qualId: string) => void }) {
  const [quals, setQuals] = useState<QualRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('qualifications')
      .select('id, code, name')
      .eq('active', true)
      .order('code')
      .then(({ data }) => {
        setQuals((data ?? []) as QualRow[]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading qualifications…
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto">
          <Award className="w-6 h-6 text-blue-500" />
        </div>
        <h3 className="text-lg font-bold text-slate-900">Select a Qualification</h3>
        <p className="text-sm text-slate-500">Choose a qualification to view or create its ACSF mapping evidence record.</p>
      </div>
      {quals.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
          <p className="text-sm text-slate-400">No active qualifications found. Add qualifications in the Qualifications page first.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {quals.map((q, i) => (
            <button
              key={q.id}
              onClick={() => onSelect(q.id)}
              className={`w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 transition-colors ${
                i > 0 ? 'border-t border-slate-100' : ''
              }`}
            >
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                <Award className="w-4 h-4 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800">{q.code}</p>
                <p className="text-xs text-slate-500 truncate">{q.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ACSFEvidencePage() {
  const [activeTab, setActiveTab] = useState<TopTab>('engine');
  const [recordQualId, setRecordQualId] = useState<string | null>(null);

  const tabs: Array<{ id: TopTab; label: string; description: string; icon: typeof Brain }> = [
    {
      id: 'engine',
      label: 'Evidence Engine',
      description: 'AI-driven ACSF analysis with indicator matching and confidence scoring',
      icon: Brain,
    },
    {
      id: 'record',
      label: 'Evidence Record',
      description: 'Formal compliance documentation — sign-off, versioning, attachments, PDF',
      icon: MapPin,
    },
  ];

  return (
    <div className="space-y-0">
      {/* Top-level tab bar */}
      <div className="bg-white border-b border-slate-200 -mx-6 px-6 mb-6 print:hidden">
        <div className="flex gap-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2.5 px-5 py-4 text-sm font-semibold transition-colors border-b-2 ${
                  isActive
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'engine' && <EAEEPage />}

      {activeTab === 'record' && (
        recordQualId
          ? <MappingEvidencePage qualId={recordQualId} onBack={() => setRecordQualId(null)} />
          : <QualificationPicker onSelect={setRecordQualId} />
      )}
    </div>
  );
}
