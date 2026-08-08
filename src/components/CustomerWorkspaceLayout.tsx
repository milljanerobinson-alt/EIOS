import { useState, useEffect, ReactNode } from 'react';
import {
  LayoutDashboard, FileText, Award, Users, BarChart3,
  ClipboardList, AlertTriangle, ShieldCheck, Settings,
  Menu, X, GraduationCap, CheckCircle2, CreditCard,
  ScrollText, Mail, Plug, ArrowDownToLine, Brain,
  UserCheck, BookOpen, ClipboardCheck, Command,
  Wrench, Globe, Zap, DollarSign, ShieldAlert,
  Database, BarChart2, Flag, Activity,
} from 'lucide-react';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { CommandPalette } from './CommandPalette';
import type { CustomerWorkspace } from '../lib/workspaceAccess';
import { setLastPage, setLastWorkspace } from '../lib/workspaceAccess';

// ─── Nav item definitions ─────────────────────────────────────────────────────

type NavItem = {
  key: string;
  label: string;
  icon: typeof Brain;
  badge?: number;
};

// ─── Workspace configurations ──────────────────────────────────────────────────

const ASSESSMENT_NAV: NavItem[] = [
  { key: 'dashboard',           label: 'Dashboard',       icon: LayoutDashboard },
  { key: 'assessments',         label: 'Assessments',     icon: FileText },
  { key: 'candidates',          label: 'Candidates',      icon: Users },
  { key: 'results',             label: 'Results',         icon: BarChart3 },
  { key: 'support-plans',       label: 'Support Plans',   icon: ClipboardList },
  { key: 'interventions',       label: 'Interventions',   icon: AlertTriangle },
  { key: 'qualifications',      label: 'Qualifications',  icon: Award },
  { key: 'compliance',          label: 'Compliance',      icon: ShieldCheck },
  { key: 'acsf-evidence',       label: 'ACSF Evidence',   icon: Brain },
  { key: 'audit-log',           label: 'Audit Log',       icon: ScrollText },
];

const TRAINER_NAV: NavItem[] = [
  { key: 'dashboard',           label: 'My Dashboard',    icon: LayoutDashboard },
  { key: 'students',            label: 'My Students',     icon: Users },
  { key: 'awaiting-review',     label: 'Awaiting Review', icon: UserCheck },
  { key: 'support-plans',       label: 'Support Plans',   icon: ClipboardList },
  { key: 'interventions',       label: 'Interventions',   icon: AlertTriangle },
  { key: 'results',             label: 'Results',         icon: BarChart3 },
  { key: 'evidence',            label: 'Evidence',        icon: BookOpen },
];

const PLATFORM_NAV: NavItem[] = [
  { key: 'dashboard',           label: 'Platform Overview', icon: LayoutDashboard },
  { key: 'settings',            label: 'Organisation',      icon: Settings },
  { key: 'users',               label: 'Users & Access',    icon: Users },
  { key: 'billing',             label: 'Billing & Usage',   icon: CreditCard },
  { key: 'axcelerate-inbound',  label: 'aXcelerate Sync',   icon: ArrowDownToLine },
  { key: 'axcelerate-log',      label: 'aXcelerate Log',    icon: Plug },
  { key: 'email-activity',      label: 'Email Activity',    icon: Mail },
  { key: 'validation',          label: 'Validation',        icon: CheckCircle2 },
  { key: 'ai-providers',        label: 'AI Providers',      icon: Zap },
  { key: 'feature-flags',       label: 'Feature Flags',     icon: Flag },
  { key: 'system-health',       label: 'System Health',     icon: Activity },
];

interface WorkspaceConfig {
  id: CustomerWorkspace;
  label: string;
  sub: string;
  icon: typeof Brain;
  logoAccent: string;
  logoText: string;
  activeItemBg: string;
  activeItemText: string;
  activeIconColor: string;
  navItems: NavItem[];
}

const WORKSPACE_CONFIGS: Record<CustomerWorkspace, WorkspaceConfig> = {
  assessment: {
    id: 'assessment',
    label: 'Candidate Assessment',
    sub: 'Operate the organisation',
    icon: GraduationCap,
    logoAccent: 'bg-primary-600',
    logoText: 'Candidate Assessment',
    activeItemBg: 'bg-primary-50',
    activeItemText: 'text-primary-700',
    activeIconColor: 'text-primary-600',
    navItems: ASSESSMENT_NAV,
  },
  trainer: {
    id: 'trainer',
    label: 'Trainer Workspace',
    sub: 'Support learners',
    icon: GraduationCap,
    logoAccent: 'bg-emerald-600',
    logoText: 'Trainer Workspace',
    activeItemBg: 'bg-emerald-50',
    activeItemText: 'text-emerald-700',
    activeIconColor: 'text-emerald-600',
    navItems: TRAINER_NAV,
  },
  platform_admin: {
    id: 'platform_admin',
    label: 'RTO Administration',
    sub: 'Configure your organisation',
    icon: Wrench,
    logoAccent: 'bg-slate-700',
    logoText: 'RTO Administration',
    activeItemBg: 'bg-slate-100',
    activeItemText: 'text-slate-900',
    activeIconColor: 'text-slate-700',
    navItems: PLATFORM_NAV,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface CustomerWorkspaceLayoutProps {
  workspace: CustomerWorkspace;
  currentPage: string;
  onPageChange: (page: string) => void;
  children: ReactNode;
}

export function CustomerWorkspaceLayout({
  workspace,
  currentPage,
  onPageChange,
  children,
}: CustomerWorkspaceLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  const cfg = WORKSPACE_CONFIGS[workspace];
  const WorkspaceIcon = cfg.icon;
  const currentNav = cfg.navItems.find(n => n.key === currentPage);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(s => !s);
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);

  function navigate(page: string) {
    setLastWorkspace(workspace);
    setLastPage(workspace, page);
    onPageChange(page);
    setSidebarOpen(false);
  }

  return (
    <div className="h-screen bg-slate-50 flex overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:sticky top-0 left-0 h-screen w-64 bg-white border-r border-slate-200 z-40
        flex flex-col transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 ${cfg.logoAccent} rounded-lg flex items-center justify-center`}>
              <WorkspaceIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">LLND Automate</div>
              <div className="text-xs text-slate-400">{cfg.logoText}</div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {cfg.navItems.map(item => {
            const Icon = item.icon;
            const active = currentPage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? `${cfg.activeItemBg} ${cfg.activeItemText}`
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? cfg.activeIconColor : 'text-slate-400'}`} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Workspace switcher in footer */}
        <div className="px-4 py-4 border-t border-slate-200">
          <WorkspaceSwitcher currentWorkspace={workspace} />
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200 px-4 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-slate-500 hover:text-slate-700"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-semibold text-slate-900">{currentNav?.label ?? currentPage}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-xs font-medium transition-colors"
              title="Command Palette (⌘K)"
            >
              <Command className="w-3.5 h-3.5" />
              <span className="text-[10px] text-slate-400">⌘K</span>
            </button>
            <div className="hidden lg:block">
              <WorkspaceSwitcher currentWorkspace={workspace} />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 lg:p-8">{children}</main>
      </div>

      <CommandPalette
        isOpen={cmdOpen}
        onClose={() => setCmdOpen(false)}
        currentWorkspace={workspace}
      />
    </div>
  );
}
