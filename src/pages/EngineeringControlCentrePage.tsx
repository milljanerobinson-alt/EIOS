import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  Package, FileText, Brain,
  Settings, Terminal,
  Activity, Clock,
  ClipboardCheck, Map,
  Layers, LineChart, GitBranch, Cpu, Wrench, Sparkles, BarChart3,
  Shield, Puzzle, Lock, Server, ToggleLeft,
  ClipboardList, GitMerge, ScrollText, Circle, DollarSign, ShieldCheck, History, Bug, BookOpen,
  ChevronRight, Star, Clock3, LayoutDashboard, X, Network, ClipboardEdit, Archive, Zap, Lightbulb,
  Globe, Box, ChevronLeft, Scale, Database, Heart, Fingerprint,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { ActiveRCProvider, useActiveRC } from '../lib/activeRC';
import { type Section } from './ecc/ECCDashboard';
import { ActiveProjectService, type EccProject, type WorkspaceMode } from '../lib/activeProjectService';
import { parseEngineeringRoute } from '../lib/engineeringNavigationService';

import { ECCMissionControlPage } from './ecc/ECCMissionControlPage';
import { ECCBacklogPage } from './ecc/ECCBacklogPage';
import { ECCReleaseCentrePage } from './ecc/ECCReleaseCentrePage';
import { ECCProductAuditPage } from './ecc/ECCProductAuditPage';
import { ECCFeaturesPage } from './ecc/ECCFeaturesPage';
import { ECCStartPhaseWizard } from './ecc/ECCStartPhaseWizard';
import { ECCAIPlatformPage } from './ecc/ECCAIPlatformPage';
import { CCRoadmapSection } from './ecc/CCRoadmapSection';
import { CCArchitectureSection } from './ecc/CCArchitectureSection';
import { CCDocumentationSection } from './ecc/CCDocumentationSection';
import { CCGoalsEpicsPage } from './ecc/CCGoalsEpicsPage';
import { ECCDevProgrammePage } from './ecc/ECCDevProgrammePage';
import { ECCAuditPage } from './ecc/ECCAuditPage';
import { ECCPlatformAdminPage } from './ecc/ECCPlatformAdminPage';
import { ECCTestingFrameworkPage } from './ecc/ECCTestingFrameworkPage';
import { ECCArchitectureGuardianPage } from './ecc/ECCArchitectureGuardianPage';
import { ECCChangeLogPage, ECCAutomaticChangeLogSection } from './ecc/ECCChangeLogPage';
import { ECCWorkflowEnginePage } from './ecc/ECCWorkflowEnginePage';
import { ECCErrorIntelligencePage } from './ecc/ECCErrorIntelligencePage';
import { ECCEngineeringReviewsPage } from './ecc/ECCEngineeringReviewsPage';
import { ECCBriefingSettingsPage } from './ecc/ECCBriefingSettingsPage';
import { ECCProductivityPage } from './ecc/ECCProductivityPage';
import { ECCEngineeringIntelligencePage } from './ecc/ECCEngineeringIntelligencePage';
import { ECCProductIntelligencePage } from './ecc/ECCProductIntelligencePage';
import { ECCBenchmarkingPage } from './ecc/ECCBenchmarkingPage';
import { ECCEngineeringGraphPage } from './ecc/ECCEngineeringGraphPage';
import { ECCModuleRegistryPage } from './ecc/ECCModuleRegistryPage';
import { ECCWorkOrdersPage } from './ecc/ECCWorkOrdersPage';
import { ECCEngineeringPlanningPage } from './ecc/ECCEngineeringPlanningPage';
import { ECCATDWorkspacePage } from './ecc/ECCATDWorkspacePage';
import { ECCReportsExportPage } from './ecc/ECCReportsExportPage';
import ECCConstitutionPage from './ecc/ECCConstitutionPage';
import ECCRecordsLibraryPage from './ecc/ECCRecordsLibraryPage';
import ECHistoricalBootstrapPage from './ecc/ECHistoricalBootstrapPage';
import ECCATDConnectPage from './ecc/ECCATDConnectPage';
import ECCExecutionPlatformPage from './ecc/ECCExecutionPlatformPage';
import ECCCodexProviderPage from './ecc/ECCCodexProviderPage';
import ECCRepositoryConfigPage from './ecc/ECCRepositoryConfigPage';
import ECCIdeaWorkspacePage from './ecc/ECCIdeaWorkspacePage';
import { ECCProjectDashboard } from './ecc/ECCProjectDashboard';
import { ECCProjectPlaceholder } from './ecc/ECCProjectPlaceholder';
import { ECCGovernancePage } from './ecc/ECCGovernancePage';
import { ECCMigrationPlannerPage } from './ecc/ECCMigrationPlannerPage';
import { ECCStandardsPage } from './ecc/ECCStandardsPage';
import { ECCIdentityReconciliationPage } from './ecc/ECCIdentityReconciliationPage';
import { ECCRecoveryDashboardPage } from './ecc/ECCRecoveryDashboardPage';
import { ECCRecoveryWorkspacePage } from './ecc/ECCRecoveryWorkspacePage';
import { ECCExecutionDashboardPage } from './ecc/ECCExecutionDashboardPage';
import { ECCExecutionWorkspacePage } from './ecc/ECCExecutionWorkspacePage';
import { ECCVerificationDashboardPage } from './ecc/ECCVerificationDashboardPage';
import { ECCEngineeringIntegrityPage } from './ecc/ECCEngineeringIntegrityPage';

// ─── Types ────────────────────────────────────────────────────────────────────

type NavItem = {
  key: Section;
  label: string;
  icon: typeof CheckCircle2;
};

type NavGroup = {
  id: string;
  label: string;
  layer?: 1 | 2 | 3 | 4;
  defaultOpen?: boolean;
  items: NavItem[];
};

// ─── Platform nav groups (all existing functionality) ────────────────────────

const PLATFORM_NAV_GROUPS: NavGroup[] = [
  {
    id: 'platform-atd',
    label: 'AI Technical Director',
    layer: 1,
    defaultOpen: true,
    items: [
      { key: 'mission-control', label: 'AI Technical Director', icon: Brain },
    ],
  },
  {
    id: 'platform-engineering',
    label: 'Engineering',
    layer: 3,
    defaultOpen: true,
    items: [
      { key: 'dev-programme',        label: 'Dev Programme',          icon: Cpu           },
      { key: 'work-orders',          label: 'Work Orders',            icon: ClipboardEdit  },
      { key: 'engineering-planning', label: 'Engineering Planning',   icon: Brain         },
      { key: 'atd-workspace',        label: 'ATD Workspace',          icon: Brain         },
      { key: 'atd-connect',           label: 'ATD Connect',           icon: Network       },
      { key: 'architecture',         label: 'Architecture',           icon: GitBranch     },
      { key: 'documentation',        label: 'Documentation',          icon: FileText      },
      { key: 'qa-testing',           label: 'Testing Framework',      icon: CheckCircle2  },
      { key: 'release-centre',       label: 'Releases',               icon: Package       },
      { key: 'audits',               label: 'Engineering Audits',     icon: Shield        },
      { key: 'engineering-reviews',  label: 'Engineering Reviews',    icon: BookOpen      },
      { key: 'arch-guardian',        label: 'Engineering Guardian',   icon: ShieldCheck   },
      { key: 'change-log',           label: 'Change Log',             icon: History       },
      { key: 'workflow-engine',      label: 'Workflow Engine',        icon: GitMerge      },
      { key: 'error-intelligence',   label: 'Error Intelligence',     icon: Bug           },
      { key: 'execution-platform',   label: 'Execution Platform',     icon: Zap           },
      { key: 'codex-provider',       label: 'Codex Provider',         icon: Cpu           },
      { key: 'repository-config',    label: 'Repository Config',      icon: GitBranch     },
    ],
  },
  {
    id: 'platform-intelligence',
    label: 'Engineering Intelligence',
    layer: 3,
    defaultOpen: false,
    items: [
      { key: 'eip',         label: 'Engineering Intelligence', icon: Cpu      },
      { key: 'pis',         label: 'Product Intelligence',     icon: Brain    },
      { key: 'analytics',   label: 'Productivity & Cost',      icon: BarChart3 },
      { key: 'benchmarking', label: 'ATD Benchmarking',        icon: BarChart3 },
      { key: 'eig-graph',   label: 'Engineering Graph',        icon: Network  },
    ],
  },
  {
    id: 'platform-governance',
    label: 'Governance',
    layer: 4,
    defaultOpen: false,
    items: [
      { key: 'governance-overview',  label: 'Governance Overview',  icon: Scale        },
      { key: 'engineering-standards',label: 'Engineering Standards', icon: BookOpen     },
      { key: 'constitution',         label: 'Constitution',          icon: Shield       },
      { key: 'records-library',      label: 'Records Library',       icon: BookOpen     },
      { key: 'historical-bootstrap',  label: 'Historical Bootstrap',   icon: Database     },
      { key: 'reports-export',       label: 'Completion Reports',    icon: Archive      },
      { key: 'ecr-reviews',          label: 'Classification Reviews', icon: ClipboardList },
      { key: 'capability-registry',  label: 'Capability Registry',   icon: Database     },
      { key: 'spc-registry',         label: 'SPC Registry',          icon: Layers       },
      { key: 'ownership-lineage',    label: 'Ownership Lineage',     icon: History      },
      { key: 'governance-health',    label: 'Governance Health',     icon: Heart        },
      { key: 'migration-plans',      label: 'Migration Plans',        icon: GitMerge      },
      { key: 'identity-reconciliation', label: 'Identity Reconciliation', icon: Fingerprint   },
      { key: 'historical-recovery',    label: 'Historical Recovery',    icon: History       },
      { key: 'engineering-execution',   label: 'Engineering Execution',  icon: Zap           },
      { key: 'verification-dashboard', label: 'Verification Dashboard', icon: ShieldCheck   },
      { key: 'engineering-integrity', label: 'Engineering Integrity', icon: ShieldCheck },
    ],
  },
  {
    id: 'platform-ai-infra',
    label: 'AI Infrastructure',
    layer: 3,
    defaultOpen: false,
    items: [
      { key: 'ai-platform',    label: 'AI Infrastructure', icon: Sparkles },
      { key: 'module-registry',label: 'Module Registry',   icon: Layers   },
    ],
  },
  {
    id: 'platform-product',
    label: 'Product Management',
    layer: 2,
    defaultOpen: false,
    items: [
      { key: 'ideas',             label: 'Goals & Epics',      icon: Layers         },
      { key: 'roadmap',           label: 'Roadmap',             icon: Map            },
      { key: 'backlog',           label: 'Ideas & Backlog',     icon: Brain          },
      { key: 'product-audit',     label: 'Feature Health',      icon: ClipboardCheck },
      { key: 'features',          label: 'Features',            icon: Wrench         },
      { key: 'engineering-ideas', label: 'Engineering Ideas',   icon: Lightbulb      },
    ],
  },
  {
    id: 'platform-ops',
    label: 'Platform Operations',
    layer: 4,
    defaultOpen: false,
    items: [
      { key: 'pa-general',            label: 'General',            icon: Settings      },
      { key: 'pa-integrations',       label: 'Integrations',       icon: Puzzle        },
      { key: 'pa-security',           label: 'Security',           icon: Lock          },
      { key: 'pa-environments',       label: 'Environments',       icon: Server        },
      { key: 'pa-feature-flags',      label: 'Feature Flags',      icon: ToggleLeft    },
      { key: 'pa-automation',         label: 'Automation',         icon: Activity      },
      { key: 'pa-monitoring',         label: 'Monitoring',         icon: Activity      },
      { key: 'pa-cost-monitoring',    label: 'Cost Monitoring',    icon: DollarSign    },
      { key: 'pa-platform-analytics', label: 'Platform Analytics', icon: LineChart     },
      { key: 'pa-audit-settings',     label: 'Audit Settings',     icon: ClipboardList },
      { key: 'pa-release-settings',   label: 'Release Settings',   icon: GitMerge      },
      { key: 'pa-system-logs',        label: 'System Logs',        icon: ScrollText    },
      { key: 'pa-briefing-settings',  label: 'Briefing Schedules', icon: Brain         },
    ],
  },
];

// ─── Project nav groups (project-scoped only) ────────────────────────────────
// Platform-only sections are intentionally excluded from Project navigation.
// Pages not yet project-scoped render ECCProjectPlaceholder instead.

const PROJECT_NAV_GROUPS: NavGroup[] = [
  {
    id: 'proj-overview',
    label: 'Project',
    layer: 2,
    defaultOpen: true,
    items: [
      { key: 'proj-dashboard',    label: 'Project Dashboard',      icon: LayoutDashboard },
      { key: 'mission-control',   label: 'AI Technical Director',  icon: Brain           },
    ],
  },
  {
    id: 'proj-product',
    label: 'Product',
    layer: 2,
    defaultOpen: true,
    items: [
      { key: 'ideas',              label: 'Goals & Epics',    icon: Layers      },
      { key: 'roadmap',            label: 'Roadmap',           icon: Map         },
      { key: 'backlog',            label: 'Ideas & Backlog',   icon: Brain       },
      { key: 'engineering-ideas',  label: 'Engineering Ideas', icon: Lightbulb   },
    ],
  },
  {
    id: 'proj-engineering',
    label: 'Engineering',
    layer: 3,
    defaultOpen: true,
    items: [
      { key: 'features',      label: 'Features',      icon: Wrench       },
      { key: 'architecture',  label: 'Architecture',  icon: GitBranch    },
      { key: 'documentation', label: 'Documentation', icon: FileText     },
      { key: 'qa-testing',    label: 'Testing',        icon: CheckCircle2 },
      { key: 'release-centre',label: 'Releases',       icon: Package      },
      { key: 'proj-records',  label: 'Project Records', icon: BookOpen    },
      { key: 'repository-config', label: 'Repository Config', icon: GitBranch },
    ],
  },
];

// ─── Sections that require full viewport height ───────────────────────────────



// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE = {
  platformGroups: 'ecc_platform_groups_open',
  projectGroups:  'ecc_project_groups_open',
  favourites:     'ecc_nav_favourites',
  recents:        'ecc_nav_recents',
};
const MAX_RECENTS = 6;

function readJSON<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; }
  catch { return fallback; }
}
function writeJSON<T>(key: string, value: T) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /**/ }
}
function defaultGroupsOpen(groups: NavGroup[]): Record<string, boolean> {
  return Object.fromEntries(groups.map(g => [g.id, g.defaultOpen ?? true]));
}

// ─── Platform status footer ───────────────────────────────────────────────────

function PlatformStatusFooter({ onNavigate }: { onNavigate: (s: Section) => void }) {
  const { activeRC } = useActiveRC();
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [env, setEnv] = useState<string>('production');

  useEffect(() => {
    supabase.from('ai_provider_configs').select('display_name').eq('is_default', true).eq('is_enabled', true)
      .maybeSingle().then(({ data }) => { if (data) setAiProvider(data.display_name); });
    supabase.from('settings').select('value').eq('key', 'environment').maybeSingle()
      .then(({ data }) => { if (data?.value) setEnv(data.value as string); });
  }, []);

  const envColor = env === 'production' ? 'bg-emerald-500' : env === 'staging' ? 'bg-amber-500' : 'bg-blue-400';

  return (
    <div className="mx-3 mb-3 bg-slate-800/60 border border-slate-700/50 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Activity className="w-3 h-3 text-slate-500" />
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Platform Status</span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        <div>
          <p className="text-[9px] text-slate-600 uppercase tracking-wider">Environment</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${envColor} shrink-0`} />
            <p className="text-[10px] font-semibold text-slate-300 capitalize truncate">{env}</p>
          </div>
        </div>
        <div>
          <p className="text-[9px] text-slate-600 uppercase tracking-wider">AI Provider</p>
          <p className="text-[10px] font-semibold text-slate-300 mt-0.5 truncate">{aiProvider ?? '—'}</p>
        </div>
        {activeRC && (
          <div className="col-span-2">
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">Current Release</p>
            <button onClick={() => onNavigate('release-centre')}
              className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 mt-0.5 truncate block transition-colors">
              {activeRC.rc_number} · {activeRC.phase_name}
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 pt-1 border-t border-slate-700/50">
        <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
        <p className="text-[9px] text-slate-500">All systems operational</p>
      </div>
    </div>
  );
}

// ─── Collapsible nav group ────────────────────────────────────────────────────

function NavGroupSection({
  group, activeSection, isOpen, favourites,
  onToggle, onNavigate, onToggleFavourite, activeRC,
}: {
  group: NavGroup; activeSection: Section; isOpen: boolean; favourites: Section[];
  onToggle: () => void; onNavigate: (s: Section) => void;
  onToggleFavourite: (key: Section) => void;
  activeRC: { rc_number: string; phase_name: string } | null;
}) {
  const hasActive = group.items.some(i => i.key === activeSection);
  return (
    <div className="mb-0.5">
      <button onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 pt-3 pb-1.5 text-left group transition-colors hover:bg-slate-800/30 ${hasActive && !isOpen ? 'bg-slate-800/20' : ''}`}
        aria-expanded={isOpen}>
        {group.layer && (
          <span className="text-[8px] font-bold text-slate-700 bg-slate-800 px-1.5 py-0.5 rounded tracking-wider shrink-0">L{group.layer}</span>
        )}
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest truncate flex-1 group-hover:text-slate-400 transition-colors">{group.label}</span>
        {hasActive && !isOpen && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />}
        <ChevronRight className={`w-3 h-3 text-slate-600 shrink-0 transition-transform duration-200 group-hover:text-slate-400 ${isOpen ? 'rotate-90' : ''}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ease-in-out ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {group.items.map(item => {
          const Icon = item.icon;
          const active = activeSection === item.key;
          const isFav = favourites.includes(item.key);
          return (
            <div key={item.key} className="relative group/item flex items-center">
              <button onClick={() => onNavigate(item.key)}
                className={`flex-1 flex items-center gap-2.5 px-4 py-1.5 transition-all text-left min-w-0 ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                <span className="truncate text-xs">{item.label}</span>
                {item.key === 'release-centre' && activeRC && (
                  <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                )}
              </button>
              <button onClick={() => onToggleFavourite(item.key)}
                className={`absolute right-1.5 p-1 rounded transition-all opacity-0 group-hover/item:opacity-100 shrink-0 ${isFav ? 'text-amber-400 opacity-100' : 'text-slate-600 hover:text-amber-400'}`}
                title={isFav ? 'Remove from favourites' : 'Add to favourites'}>
                <Star className={`w-2.5 h-2.5 ${isFav ? 'fill-amber-400' : ''}`} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Home view ────────────────────────────────────────────────────────────────

function HomeView({ projects, onSelectPlatform, onSelectProject }: {
  projects: EccProject[];
  onSelectPlatform: () => void;
  onSelectProject: (p: EccProject) => void;
}) {
  return (
    <div className="flex-1 overflow-auto bg-slate-50 p-6 lg:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Terminal className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">AI Technical Director</h1>
            <p className="text-xs text-slate-400">Engineering Operating System · EIOS</p>
          </div>
        </div>
        <section>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Platform</p>
          <button onClick={onSelectPlatform}
            className="w-full flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group text-left">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shrink-0 group-hover:bg-blue-600 transition-colors">
              <Globe className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900">EIOS Platform</p>
              <p className="text-xs text-slate-500 mt-0.5">Engineering standards, AI infrastructure, intelligence layer, platform governance</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0 transition-colors" />
          </button>
        </section>
        {projects.length > 0 && (
        <section>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Projects</p>
          <div className="space-y-2">
            {projects.map(project => (
              <button key={project.id} onClick={() => onSelectProject(project)}
                className="w-full flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:shadow-sm transition-all group text-left"
                style={{ '--hover-border': project.colour ?? '#EAB308' } as React.CSSProperties}
                onMouseEnter={e => (e.currentTarget.style.borderColor = project.colour ?? '#EAB308')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#E2E8F0')}
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${project.colour ?? '#EAB308'}15`, border: `1px solid ${project.colour ?? '#EAB308'}30` }}>
                  <Box className="w-5 h-5" style={{ color: project.colour ?? '#EAB308' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{project.name}</p>
                  {project.description && <p className="text-xs text-slate-500 mt-0.5 truncate">{project.description}</p>}
                </div>
                {project.is_default && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white shrink-0"
                    style={{ backgroundColor: project.colour ?? '#EAB308' }}>Default</span>
                )}
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </button>
            ))}
          </div>
        </section>
        )}
      </div>
    </div>
  );
}

// ─── Workspace sidebar ────────────────────────────────────────────────────────

function WorkspaceSidebar({
  workspaceMode, activeProject, projects, activeSection, sidebarOpen,
  groupsOpen, favourites, activeRC, onNavigate, onCloseSidebar,
  onToggleGroup, onToggleFavourite, onSwitchToHome, onSwitchToProject, onSwitchToPlatform,
}: {
  workspaceMode: WorkspaceMode; activeProject: EccProject | null;
  projects: EccProject[]; activeSection: Section; sidebarOpen: boolean;
  groupsOpen: Record<string, boolean>; favourites: Section[];
  activeRC: { rc_number: string; phase_name: string } | null;
  onNavigate: (s: Section) => void; onCloseSidebar: () => void;
  onToggleGroup: (id: string) => void; onToggleFavourite: (key: Section) => void;
  onSwitchToHome: () => void; onSwitchToProject: (p: EccProject) => void; onSwitchToPlatform: () => void;
}) {
  const navGroups   = (workspaceMode === 'project' && projects.length > 0) ? PROJECT_NAV_GROUPS : PLATFORM_NAV_GROUPS;
  const allItems    = navGroups.flatMap(g => g.items);
  const accentColor = workspaceMode === 'project' ? (activeProject?.colour ?? '#EAB308') : null;
  const recents     = readJSON<Section[]>(STORAGE.recents, [])
    .filter(k => k !== activeSection)
    .map(k => allItems.find(i => i.key === k))
    .filter(Boolean) as NavItem[];
  const favItems    = favourites.map(k => allItems.find(i => i.key === k)).filter(Boolean) as NavItem[];

  // Pinned item — "proj-dashboard" in project mode, "mission-control" in platform mode
  const pinnedKey: Section = (workspaceMode === 'project' && projects.length > 0) ? 'proj-dashboard' : 'mission-control';
  const pinnedLabel = workspaceMode === 'project' ? 'Project Dashboard' : 'Executive Dashboard';
  const pinnedIcon  = workspaceMode === 'project' ? Box : LayoutDashboard;
  const PinnedIcon  = pinnedIcon;

  return (
    <aside className={`
      fixed md:sticky top-0 left-0 h-full md:h-auto z-40
      w-60 shrink-0 bg-slate-900 flex flex-col border-r border-slate-800
      transition-transform duration-300
      ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
    `}>

      {/* Context header */}
      <div className="px-3 py-3 border-b border-slate-800/60 shrink-0">
        <button onClick={onSwitchToHome}
          className="flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-300 mb-2 transition-colors">
          <ChevronLeft className="w-3 h-3" />
          <span className="uppercase tracking-widest font-bold">All Workspaces</span>
        </button>

        {/* Active context badge */}
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-700/50"
          style={accentColor ? { borderColor: `${accentColor}30` } : {}}>
          {workspaceMode === 'platform' ? (
            <>
              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Platform</p>
                <p className="text-xs font-semibold text-white truncate">EIOS</p>
              </div>
            </>
          ) : (
            <>
              <Box className="w-3.5 h-3.5 shrink-0" style={{ color: accentColor ?? '#EAB308' }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accentColor ?? '#EAB308' }}>Project</p>
                <p className="text-xs font-semibold text-white truncate">{activeProject?.name ?? '—'}</p>
              </div>
            </>
          )}
        </div>

        {/* Quick switcher */}
        <div className="mt-2 flex gap-1">
          <button onClick={onSwitchToPlatform}
            className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-semibold transition-colors ${workspaceMode === 'platform' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}>
            <Globe className="w-2.5 h-2.5" />Platform
          </button>
          {projects.map(p => (
            <button key={p.id} onClick={() => onSwitchToProject(p)} title={p.name}
              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded text-[10px] font-semibold transition-colors truncate ${workspaceMode === 'project' && activeProject?.id === p.id ? 'text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
              style={workspaceMode === 'project' && activeProject?.id === p.id ? { backgroundColor: p.colour ?? '#EAB308' } : {}}>
              <Box className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">{p.name.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Mobile close */}
      <button onClick={onCloseSidebar}
        className="absolute top-3 right-3 md:hidden p-2 text-slate-500 hover:text-slate-300 rounded-lg"
        aria-label="Close navigation">
        <X className="w-4 h-4" />
      </button>

      {/* Nav body */}
      <nav className="flex-1 overflow-y-auto py-1" aria-label="Engineering navigation">
        {/* Pinned top item */}
        <div className="px-2 pt-2 pb-1">
          <button onClick={() => onNavigate(pinnedKey)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all text-left ${activeSection === pinnedKey ? 'text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}
            style={activeSection === pinnedKey ? { backgroundColor: accentColor ?? '#2563EB' } : {}}
            aria-current={activeSection === pinnedKey ? 'page' : undefined}>
            <PinnedIcon className={`w-3.5 h-3.5 shrink-0 ${activeSection === pinnedKey ? 'text-white' : 'text-slate-500'}`} />
            <span className="text-xs font-semibold">{pinnedLabel}</span>
          </button>
        </div>

        {/* Favourites */}
        {favItems.length > 0 && (
          <div className="mb-0.5">
            <div className="px-3 pt-2 pb-1 flex items-center gap-2">
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Favourites</span>
            </div>
            {favItems.map(item => {
              const Icon = item.icon; const active = activeSection === item.key;
              return (
                <div key={item.key} className="relative group/item flex items-center">
                  <button onClick={() => onNavigate(item.key)}
                    className={`flex-1 flex items-center gap-2.5 px-4 py-1.5 transition-all text-left min-w-0 ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}>
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span className="truncate text-xs">{item.label}</span>
                  </button>
                  <button onClick={() => onToggleFavourite(item.key)}
                    className="absolute right-1.5 p-1 rounded text-amber-400 opacity-0 group-hover/item:opacity-100 hover:text-amber-300 transition-all shrink-0">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Recents */}
        {recents.length > 0 && (
          <div className="mb-0.5">
            <div className="px-3 pt-2 pb-1 flex items-center gap-2">
              <Clock3 className="w-3 h-3 text-slate-600" />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Recent</span>
            </div>
            {recents.slice(0, 4).map(item => {
              const Icon = item.icon; const active = activeSection === item.key;
              return (
                <button key={item.key} onClick={() => onNavigate(item.key)}
                  className={`w-full flex items-center gap-2.5 px-4 py-1.5 transition-all text-left min-w-0 ${active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'}`}>
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-blue-400' : 'text-slate-500'}`} />
                  <span className="truncate text-xs">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {(favItems.length > 0 || recents.length > 0) && (
          <div className="mx-3 my-1 border-t border-slate-800/60" />
        )}

        {/* Nav groups — skip pinned groups (they render their item above) */}
        {navGroups
          .filter(g => g.id !== 'platform-atd' && g.id !== 'proj-overview')
          .map(group => (
            <NavGroupSection key={group.id} group={group} activeSection={activeSection}
              isOpen={groupsOpen[group.id] ?? group.defaultOpen ?? true}
              favourites={favourites} onToggle={() => onToggleGroup(group.id)}
              onNavigate={onNavigate} onToggleFavourite={onToggleFavourite} activeRC={activeRC} />
          ))}
      </nav>

      {workspaceMode === 'platform' && <PlatformStatusFooter onNavigate={onNavigate} />}

      <div className="px-4 py-3 border-t border-slate-800/60 shrink-0">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-slate-600" />
          <p className="text-[10px] text-slate-600">ATD · EIOS v2.0</p>
        </div>
      </div>
    </aside>
  );
}

// ─── Platform section renderer ────────────────────────────────────────────────

function renderPlatformSection(section: Section, onNavigate: (s: Section) => void, workspaceMode?: WorkspaceMode, activeProject?: EccProject | null, objectRef?: string, subPath?: string) {
  switch (section) {
    case 'mission-control':       return <ECCMissionControlPage onNavigate={onNavigate} />;
    case 'dev-programme':         return <ECCDevProgrammePage />;
    case 'ai-platform':           return <ECCAIPlatformPage />;
    case 'ideas':                 return <CCGoalsEpicsPage />;
    case 'roadmap':               return <CCRoadmapSection />;
    case 'backlog':               return <ECCBacklogPage />;
    case 'product-audit':         return <ECCProductAuditPage />;
    case 'features':              return <ECCFeaturesPage />;
    case 'qa-testing':            return <ECCTestingFrameworkPage />;
    case 'release-centre':        return <ECCReleaseCentrePage />;
    case 'architecture':          return <CCArchitectureSection />;
    case 'documentation':         return <CCDocumentationSection />;
    case 'audits':                return <ECCAuditPage />;
    case 'work-orders':           return <ECCWorkOrdersPage objectRef={objectRef} subPath={subPath} />;
    case 'engineering-planning':  return <ECCEngineeringPlanningPage />;
    case 'atd-workspace':         return <ECCATDWorkspacePage workspaceMode={workspaceMode} activeProject={activeProject} />;
    case 'engineering-reviews':   return <ECCEngineeringReviewsPage />;
    case 'arch-guardian':         return <ECCArchitectureGuardianPage />;
    case 'change-log':            return <ECCAutomaticChangeLogSection />;
    case 'workflow-engine':       return <ECCWorkflowEnginePage />;
    case 'error-intelligence':    return <ECCErrorIntelligencePage />;
    case 'pa-general': case 'pa-integrations': case 'pa-security': case 'pa-environments':
    case 'pa-feature-flags': case 'pa-automation': case 'pa-monitoring': case 'pa-cost-monitoring':
    case 'pa-platform-analytics': case 'pa-audit-settings': case 'pa-release-settings': case 'pa-system-logs':
      return <ECCPlatformAdminPage activeSection={section} />;
    case 'pa-briefing-settings':  return <ECCBriefingSettingsPage />;
    case 'analytics':             return <ECCProductivityPage />;
    case 'eip':                   return <ECCEngineeringIntelligencePage />;
    case 'pis':                   return <ECCProductIntelligencePage />;
    case 'benchmarking':          return <ECCBenchmarkingPage />;
    case 'eig-graph':             return <ECCEngineeringGraphPage />;
    case 'module-registry':       return <ECCModuleRegistryPage />;
    case 'reports-export':        return <ECCReportsExportPage />;
    case 'constitution':          return <ECCConstitutionPage />;
    case 'records-library':       return <ECCRecordsLibraryPage objectRef={objectRef} />;
    case 'historical-bootstrap':   return <ECHistoricalBootstrapPage />;
    case 'atd-connect':            return <ECCATDConnectPage />;
    case 'execution-platform':    return <ECCExecutionPlatformPage />;
    case 'codex-provider':        return <ECCCodexProviderPage />;
    case 'repository-config':     return <ECCRepositoryConfigPage />;
    case 'engineering-ideas':     return <ECCIdeaWorkspacePage />;
    case 'engineering-standards': return <ECCStandardsPage />;
    case 'governance-overview':
    case 'ecr-reviews':
    case 'capability-registry':
    case 'spc-registry':
    case 'ownership-lineage':
    case 'governance-health':
      return <ECCGovernancePage section={section} onNavigate={onNavigate} />;
    case 'migration-plans':
      return <ECCMigrationPlannerPage />;
    case 'identity-reconciliation':
      return <ECCIdentityReconciliationPage />;
    case 'historical-recovery':
      return objectRef
        ? <ECCRecoveryWorkspacePage packageId={objectRef} onBack={() => onNavigate('historical-recovery')} />
        : <ECCRecoveryDashboardPage onSelectPackage={(id) => (onNavigate as (s: Section, ref?: string) => void)('historical-recovery', id)} />;
    case 'engineering-execution':
      return objectRef
        ? <ECCExecutionWorkspacePage executionRef={objectRef} onBack={() => onNavigate('engineering-execution')} />
        : <ECCExecutionDashboardPage onSelectExecution={(ref) => (onNavigate as (s: Section, ref?: string) => void)('engineering-execution', ref)} />;
    case 'verification-dashboard':
      return <ECCVerificationDashboardPage />;
    case 'engineering-integrity':
      return <ECCEngineeringIntegrityPage onNavigate={onNavigate} />;
    default: return (
      <div className="p-6 lg:p-8">
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-8 text-center max-w-lg">
          <Terminal className="w-8 h-8 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-600 capitalize">{section.replace(/-/g, ' ')}</p>
          <p className="text-xs text-slate-400 mt-2">Coming soon.</p>
        </div>
      </div>
    );
  }
}

// ─── Project section renderer ─────────────────────────────────────────────────
// Safe sections show real content. Unscoped sections show ECCProjectPlaceholder.

const PROJECT_SAFE_SECTIONS = new Set<Section>([
  'mission-control',
  'atd-workspace',
  'engineering-ideas',
]);

function renderProjectSection(
  section: Section,
  project: EccProject,
  onNavigate: (s: Section) => void,
  onSwitchToPlatform: () => void,
  objectRef?: string,
  subPath?: string,
) {
  // ─── Platform-level sections that always render, even in project mode ──────────
  // These sections operate on platform-wide data (recovery, verification,
  // governance, etc.) and must NOT be replaced by a project placeholder.
  // EWO-014.19A: Historical Recovery was silently swallowed by the project
  // placeholder, making the Open button appear non-functional.
  const PLATFORM_SECTIONS_IN_PROJECT: Partial<Record<Section, boolean>> = {
    'historical-recovery': true,
    'engineering-execution': true,
    'verification-dashboard': true,
    'engineering-integrity': true,
    'identity-reconciliation': true,
    'work-orders': true,
    'audits': true,
    'product-audit': true,
    'governance': true,
    'constitution': true,
    'standards': true,
    'change-log': true,
    'engineering-graph': true,
    'engineering-intelligence': true,
    'error-intelligence': true,
    'product-intelligence': true,
    'productivity': true,
    'benchmarking': true,
    'briefing-settings': true,
    'ai-journal': true,
    'ai-providers': true,
    'ai-playground': true,
    'platform-admin': true,
    'module-registry': true,
    'execution-platform': true,
    'repository-config': true,
    'migration-plans': true,
    'records-library': true,
    'historical-bootstrap': true,
    'reports-export': true,
    'project-compass': true,
    'testing': true,
    'tp001': true,
    'defects': true,
    'reviews': true,
    'decision-log': true,
    'timeline': true,
    'phases': true,
    'milestones': true,
    'compliance-checklist': true,
    'po-test-guide': true,
  };

  if (PLATFORM_SECTIONS_IN_PROJECT[section]) {
    return renderPlatformSection(section, onNavigate, 'platform', null, objectRef, subPath);
  }

  // Project Dashboard — dedicated landing page (only if project is active)
  if (section === 'proj-dashboard' && project) {
    return <ECCProjectDashboard project={project} onNavigate={onNavigate} />;
  }

  // ATD conversation — genuinely project-safe
  if (section === 'mission-control') {
    return <ECCMissionControlPage onNavigate={onNavigate} />;
  }

  // Engineering Sessions — project-scoped ATD workspace
  if (section === 'atd-workspace') {
    return <ECCATDWorkspacePage workspaceMode="project" activeProject={project} />;
  }

  // Engineering Ideas — new idea creation, project-safe
  if (section === 'engineering-ideas') {
    return <ECCIdeaWorkspacePage />;
  }

  // Testing and Releases use Platform data but are listed in project nav.
  // Show placeholder with option to switch to Platform.
  const PLACEHOLDERS: Partial<Record<Section, string>> = {
    'ideas':         'Goals & Epics',
    'roadmap':       'Roadmap',
    'backlog':       'Ideas & Backlog',
    'features':      'Features',
    'architecture':  'Architecture',
    'documentation': 'Documentation',
    'qa-testing':    'Testing',
    'release-centre':'Releases',
    'proj-records':  'Project Records',
  };

  if (section in PLACEHOLDERS) {
    return (
      <ECCProjectPlaceholder
        project={project}
        sectionLabel={PLACEHOLDERS[section]!}
        onSwitchToPlatform={onSwitchToPlatform}
      />
    );
  }

  // Fallback — section exists in platform but not project context
  return (
    <ECCProjectPlaceholder
      project={project}
      sectionLabel={section.replace(/-/g, ' ')}
      onSwitchToPlatform={onSwitchToPlatform}
    />
  );
}

// ─── Inner layout ─────────────────────────────────────────────────────────────

type TopLevelView = 'home' | 'workspace';

function ECCInner({ initialPage, objectRef, subPath }: { initialPage?: Section; objectRef?: string; subPath?: string }) {
  const [activeSection, setActiveSection] = useState<Section>(initialPage ?? 'mission-control');
  const [currentObjectRef, setCurrentObjectRef] = useState<string | undefined>(objectRef);
  const [currentSubPath, setCurrentSubPath] = useState<string | undefined>(subPath);
  const [showWizard,    setShowWizard]    = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [topView,       setTopView]       = useState<TopLevelView>('workspace');
  const { activeRC, refresh } = useActiveRC();

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() =>
    ActiveProjectService.getWorkspaceMode()
  );
  const [activeProject, setActiveProject] = useState<EccProject | null>(null);
  const [projects,      setProjects]      = useState<EccProject[]>([]);

  const [groupsOpen, setGroupsOpen] = useState<Record<string, boolean>>(() => {
    const mode = ActiveProjectService.getWorkspaceMode();
    const groups = mode === 'platform' ? PLATFORM_NAV_GROUPS : PROJECT_NAV_GROUPS;
    const key    = mode === 'platform' ? STORAGE.platformGroups : STORAGE.projectGroups;
    return readJSON(key, defaultGroupsOpen(groups));
  });
  const [favourites, setFavourites] = useState<Section[]>(() =>
    readJSON<Section[]>(STORAGE.favourites, [])
  );

  // EWO-014.13R: Re-derive section + objectRef from URL on hashchange so
  // browser back/forward, breadcrumbs, and related-engineering navigation
  // are all driven by the canonical URL (single source of truth).
  useEffect(() => {
    function onHashChange() {
      const parsed = parseEngineeringRoute(window.location.hash);
      const section = (parsed.section || 'mission-control') as Section;
      setActiveSection(prev => (prev !== section ? section : prev));
      setCurrentObjectRef(parsed.objectRef ?? undefined);
      setCurrentSubPath(parsed.subPath ?? undefined);
    }
    onHashChange();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    ActiveProjectService.listProjects().then(list => {
      setProjects(list);
      // EWO-014: If no active projects exist, force Platform-only mode
      if (list.length === 0) {
        setWorkspaceMode('platform');
        ActiveProjectService.setWorkspaceMode('platform');
        setActiveProject(null);
        return;
      }
      ActiveProjectService.resolveActiveProject().then(p => {
        setActiveProject(p);
        setWorkspaceMode(ActiveProjectService.getWorkspaceMode());
      });
    });
  }, []);

  // EWO-014.7: Listen for cross-page navigation from ATD Workspace → Work Orders
  useEffect(() => {
    const handler = () => {
      if (sessionStorage.getItem('ecc_navigate_to_work_orders') === 'true') {
        sessionStorage.removeItem('ecc_navigate_to_work_orders');
        setActiveSection('work-orders');
        localStorage.setItem('ecc_workspace_page_engineering', 'work-orders');
        window.location.hash = '#/engineering/work-orders';
      }
    };
    window.addEventListener('ecc:navigateToWorkOrders', handler);
    return () => window.removeEventListener('ecc:navigateToWorkOrders', handler);
  }, []);

  const navigate = useCallback((section: Section, objRef?: string) => {
    setActiveSection(section);
    localStorage.setItem('ecc_workspace_page_engineering', section);
    window.location.hash = objRef
      ? `#/engineering/${section}/${objRef}`
      : `#/engineering/${section}`;
    if (objRef) setCurrentObjectRef(objRef);
    setSidebarOpen(false);
    const prev = readJSON<Section[]>(STORAGE.recents, []);
    writeJSON(STORAGE.recents, [section, ...prev.filter(s => s !== section)].slice(0, MAX_RECENTS));
  }, []);

  function toggleGroup(id: string) {
    setGroupsOpen(prev => {
      const next = { ...prev, [id]: !prev[id] };
      writeJSON(workspaceMode === 'platform' ? STORAGE.platformGroups : STORAGE.projectGroups, next);
      return next;
    });
  }

  function toggleFavourite(key: Section) {
    setFavourites(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      writeJSON(STORAGE.favourites, next);
      return next;
    });
  }

  function switchToPlatform() {
    setWorkspaceMode('platform');
    setTopView('workspace');
    ActiveProjectService.setWorkspaceMode('platform');
    const stored = readJSON(STORAGE.platformGroups, defaultGroupsOpen(PLATFORM_NAV_GROUPS));
    setGroupsOpen(stored);
    navigate('mission-control');
  }

  function switchToProject(project: EccProject) {
    setWorkspaceMode('project');
    setTopView('workspace');
    setActiveProject(project);
    ActiveProjectService.setWorkspaceMode('project');
    ActiveProjectService.setActiveProjectId(project.id);
    const stored = readJSON(STORAGE.projectGroups, defaultGroupsOpen(PROJECT_NAV_GROUPS));
    setGroupsOpen(stored);
    navigate('proj-dashboard');
  }

  function switchToHome() {
    setTopView('home');
    setSidebarOpen(false);
  }

  // Auto-expand group containing active section on initial load
  useEffect(() => {
    const groups = (workspaceMode === 'project' && projects.length > 0) ? PROJECT_NAV_GROUPS : PLATFORM_NAV_GROUPS;
    const groupId = groups.find(g => g.items.some(i => i.key === activeSection))?.id;
    if (groupId && !groupsOpen[groupId]) {
      setGroupsOpen(prev => {
        const next = { ...prev, [groupId]: true };
        writeJSON(workspaceMode === 'platform' ? STORAGE.platformGroups : STORAGE.projectGroups, next);
        return next;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accentColor  = (workspaceMode === 'project' && projects.length > 0) ? (activeProject?.colour ?? '#EAB308') : null;

  // ─── Home view ───────────────────────────────────────────────────────────────
  if (topView === 'home') {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
          <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
            <Terminal className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-bold text-white">AI Technical Director</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest">· EIOS</span>
        </div>
        <HomeView projects={projects} onSelectPlatform={switchToPlatform} onSelectProject={switchToProject} />
      </div>
    );
  }

  // ─── Workspace view ───────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      {/* Project colour accent line — only visible in project mode */}
      {accentColor && (
        <div className="w-full shrink-0" style={{ height: '4px', backgroundColor: accentColor }} aria-hidden="true" />
      )}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Mobile top bar */}
      <div className="flex items-center gap-3 px-3 py-2.5 bg-slate-900 border-b border-slate-800 md:hidden shrink-0">
        <button onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white" aria-label="Open navigation">
          <LineChart className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest flex-1 truncate">
          {activeSection.replace(/-/g, ' ')}
        </span>
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700/50"
          style={accentColor ? { borderColor: `${accentColor}40` } : {}}>
          {workspaceMode === 'platform'
            ? <Globe className="w-3 h-3 text-slate-400" />
            : <Box className="w-3 h-3" style={{ color: accentColor ?? '#EAB308' }} />}
          <span className="text-[10px] font-semibold text-slate-300 truncate max-w-[80px]">
            {workspaceMode === 'platform' ? 'Platform' : (activeProject?.name ?? 'Project')}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <WorkspaceSidebar
          workspaceMode={workspaceMode} activeProject={activeProject} projects={projects}
          activeSection={activeSection} sidebarOpen={sidebarOpen}
          groupsOpen={groupsOpen} favourites={favourites} activeRC={activeRC}
          onNavigate={navigate} onCloseSidebar={() => setSidebarOpen(false)}
          onToggleGroup={toggleGroup} onToggleFavourite={toggleFavourite}
          onSwitchToHome={switchToHome} onSwitchToProject={switchToProject}
          onSwitchToPlatform={switchToPlatform}
        />

        {/* Content — canonical scroll container: always overflow-y-auto.
            Pages needing internal scroll regions use h-full overflow-hidden
            on their own root and manage scroll internally. */}
        <div className="flex-1 bg-slate-50 overflow-y-auto">
          {workspaceMode === 'platform'
            ? renderPlatformSection(activeSection, navigate, workspaceMode, activeProject, currentObjectRef, currentSubPath)
            : renderProjectSection(activeSection, activeProject ?? { id: '', name: 'Project', slug: '', description: null, status: 'active', is_default: false, icon_key: null, colour: '#EAB308', sort_order: 0, created_at: '', updated_at: '' }, navigate, switchToPlatform, currentObjectRef, currentSubPath)
          }
        </div>
      </div>

      {showWizard && (
        <ECCStartPhaseWizard
          onClose={() => setShowWizard(false)}
          onComplete={() => { setShowWizard(false); refresh(); navigate('release-centre'); }}
        />
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function EngineeringControlCentrePage({ initialPage, objectRef, subPath }: { initialPage?: Section; objectRef?: string; subPath?: string } = {}) {
  return (
    <ActiveRCProvider>
      <ECCInner initialPage={initialPage} objectRef={objectRef} subPath={subPath} />
    </ActiveRCProvider>
  );
}
