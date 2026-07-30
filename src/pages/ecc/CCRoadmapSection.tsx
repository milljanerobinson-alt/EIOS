import { useState } from 'react';
import { Map, Flag, Layers, Compass } from 'lucide-react';
import { ECCRoadmapPage } from './ECCRoadmapPage';
import { ECCMilestonesPage } from './ECCMilestonesPage';
import { ECCPhasesPage } from './ECCPhasesPage';
import { ECCProjectCompassPage } from './ECCProjectCompassPage';

type Tab = 'roadmap' | 'milestones' | 'phases' | 'vision';

const TABS: { key: Tab; label: string; icon: typeof Map }[] = [
  { key: 'roadmap',     label: 'Roadmap',    icon: Map },
  { key: 'milestones',  label: 'Milestones', icon: Flag },
  { key: 'phases',      label: 'Phases',     icon: Layers },
  { key: 'vision',      label: 'Vision',     icon: Compass },
];

export function CCRoadmapSection() {
  const [tab, setTab] = useState<Tab>('roadmap');

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
        {tab === 'roadmap'    && <ECCRoadmapPage />}
        {tab === 'milestones' && <ECCMilestonesPage />}
        {tab === 'phases'     && <ECCPhasesPage />}
        {tab === 'vision'     && <ECCProjectCompassPage />}
      </div>
    </div>
  );
}
