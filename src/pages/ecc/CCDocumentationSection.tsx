import { useState } from 'react';
import { FileText, Brain } from 'lucide-react';
import { ECCDocumentationPage } from './ECCDocumentationPage';
import { ECCAIJournalPage } from './ECCAIJournalPage';

type Tab = 'docs' | 'journal';

const TABS: { key: Tab; label: string; icon: typeof FileText }[] = [
  { key: 'docs',    label: 'Documentation', icon: FileText },
  { key: 'journal', label: 'AI Journal',    icon: Brain },
];

export function CCDocumentationSection() {
  const [tab, setTab] = useState<Tab>('docs');

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6">
        <div className="flex gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {tab === 'docs'    && <ECCDocumentationPage />}
        {tab === 'journal' && <ECCAIJournalPage />}
      </div>
    </div>
  );
}
