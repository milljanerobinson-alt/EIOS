import { Box, Brain, MessageSquare, Lightbulb, Map, ClipboardList, Wrench, GitBranch, FileText, CheckCircle2, Package, ArrowRight, Activity } from 'lucide-react';
import type { EccProject } from '../../lib/activeProjectService';
import type { Section } from './ECCDashboard';

interface ECCProjectDashboardProps {
  project: EccProject;
  onNavigate: (s: Section) => void;
}

const QUICK_LINKS: { key: Section; label: string; description: string; icon: typeof Brain; safe: boolean }[] = [
  { key: 'mission-control',    label: 'AI Technical Director', description: 'Engineering conversations and decisions', icon: Brain,          safe: true  },
  { key: 'ideas',              label: 'Goals & Epics',          description: 'Project goals and objectives',           icon: ClipboardList,  safe: false },
  { key: 'roadmap',            label: 'Roadmap',                description: 'Release plan and milestones',            icon: Map,            safe: false },
  { key: 'backlog',            label: 'Ideas & Backlog',        description: 'Engineering backlog items',              icon: Brain,          safe: false },
  { key: 'engineering-ideas',  label: 'Engineering Ideas',      description: 'New ideas and proposals',               icon: Lightbulb,      safe: true  },
  { key: 'features',           label: 'Features',               description: 'Feature registry and status',           icon: Wrench,         safe: false },
  { key: 'architecture',       label: 'Architecture',           description: 'System architecture and decisions',     icon: GitBranch,      safe: false },
  { key: 'documentation',      label: 'Documentation',          description: 'Project documentation',                 icon: FileText,       safe: false },
  { key: 'qa-testing',         label: 'Testing',                description: 'Test plans and results',                icon: CheckCircle2,   safe: false },
  { key: 'release-centre',     label: 'Releases',               description: 'Release candidates and history',        icon: Package,        safe: false },
];

export function ECCProjectDashboard({ project, onNavigate }: ECCProjectDashboardProps) {
  const accentColor = project.colour ?? '#EAB308';

  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Project Identity Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex items-start gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${accentColor}18`, border: `1.5px solid ${accentColor}40` }}
          >
            <Box className="w-6 h-6" style={{ color: accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Project</span>
              {project.is_default && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: accentColor }}>
                  Default
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-slate-900">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">{project.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0" style={{ borderColor: `${accentColor}30`, backgroundColor: `${accentColor}08` }}>
            <Activity className="w-3 h-3" style={{ color: accentColor }} />
            <span className="text-[10px] font-semibold capitalize" style={{ color: accentColor }}>{project.status}</span>
          </div>
        </div>

        {/* Scoping Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <div className="w-1 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
          <div>
            <p className="text-xs font-bold text-amber-800 mb-1">Project Scoping — EWO-014</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Project-specific records will be introduced in EWO-014. Most sections below show
              fresh project views awaiting data. Platform-wide records remain available and unchanged
              in the Platform workspace.
            </p>
          </div>
        </div>

        {/* Quick links grid */}
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Project Workspace</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {QUICK_LINKS.map(({ key, label, description, icon: Icon, safe }) => (
              <button
                key={key}
                onClick={() => onNavigate(key)}
                className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 hover:shadow-sm transition-all text-left group"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={safe
                    ? { backgroundColor: `${accentColor}15`, border: `1px solid ${accentColor}25` }
                    : { backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }
                  }
                >
                  <Icon className="w-4 h-4" style={safe ? { color: accentColor } : { color: '#94A3B8' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">{label}</p>
                  <p className="text-[11px] text-slate-400 truncate">{description}</p>
                </div>
                {!safe && (
                  <span className="text-[9px] font-semibold text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded shrink-0">EWO-014</span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
