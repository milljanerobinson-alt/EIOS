import { Folder, ArrowRight } from 'lucide-react';
import type { EccProject } from '../../lib/activeProjectService';

interface ECCProjectPlaceholderProps {
  project: EccProject;
  sectionLabel: string;
  onSwitchToPlatform?: () => void;
}

export function ECCProjectPlaceholder({ project, sectionLabel, onSwitchToPlatform }: ECCProjectPlaceholderProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
      <div className="max-w-md w-full">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${project.colour ?? '#EAB308'}18`, border: `1px solid ${project.colour ?? '#EAB308'}30` }}
          >
            <Folder className="w-6 h-6" style={{ color: project.colour ?? '#EAB308' }} />
          </div>

          <h2 className="text-sm font-bold text-slate-900 mb-1">{sectionLabel}</h2>
          <p className="text-xs font-semibold mb-1" style={{ color: project.colour ?? '#EAB308' }}>
            {project.name}
          </p>

          <p className="text-xs text-slate-500 leading-relaxed mt-3 mb-5">
            Project-specific data for <strong className="text-slate-700">{sectionLabel}</strong> will
            appear here after Project Scoping is completed in EWO-014.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-left mb-5">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">What this means</p>
            <p className="text-xs text-slate-600 leading-relaxed">
              Existing platform-wide records have not yet been attributed to individual projects.
              They remain available and unchanged in the Platform workspace.
            </p>
          </div>

          {onSwitchToPlatform && (
            <button
              onClick={onSwitchToPlatform}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all text-xs font-semibold mx-auto"
            >
              View Platform Records
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
