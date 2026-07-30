import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, X, ArrowRight, LayoutDashboard, FileText, Award, Users, BarChart3,
  ClipboardList, AlertTriangle, ShieldCheck, ScrollText, Mail, Plug,
  ArrowDownToLine, CheckCircle2, CreditCard, Settings, Brain,
  Layers, Map, Package, Wrench, GitBranch, Shield,
  ShieldCheck as ShieldCheckEng, History, Sparkles, Cpu, Activity,
  DollarSign, ToggleLeft, Lock, Server, ClipboardCheck,
  Terminal, GraduationCap, UserCheck, BookOpen, Globe, Zap, Flag, Database,
  GitMerge,
} from 'lucide-react';
import { type AnyWorkspace, workspaceHash, setLastWorkspace, setLastPage } from '../lib/workspaceAccess';

interface CommandEntry {
  workspace: AnyWorkspace;
  page: string;
  label: string;
  group: string;
  icon: typeof Brain;
  keywords?: string;
}

const COMMANDS: CommandEntry[] = [
  // Assessment Platform
  { workspace: 'assessment', page: 'dashboard',          label: 'Dashboard',          group: 'Assessment Platform', icon: LayoutDashboard },
  { workspace: 'assessment', page: 'assessments',        label: 'Assessments',        group: 'Assessment Platform', icon: FileText },
  { workspace: 'assessment', page: 'qualifications',     label: 'Qualifications',     group: 'Assessment Platform', icon: Award },
  { workspace: 'assessment', page: 'candidates',         label: 'Candidates',         group: 'Assessment Platform', icon: Users },
  { workspace: 'assessment', page: 'results',            label: 'Results',            group: 'Assessment Platform', icon: BarChart3 },
  { workspace: 'assessment', page: 'support-plans',      label: 'Support Plans',      group: 'Assessment Platform', icon: ClipboardList },
  { workspace: 'assessment', page: 'interventions',      label: 'Interventions',      group: 'Assessment Platform', icon: AlertTriangle },
  { workspace: 'assessment', page: 'compliance',         label: 'Compliance',         group: 'Assessment Platform', icon: ShieldCheck },
  { workspace: 'assessment', page: 'acsf-evidence',      label: 'ACSF Evidence',      group: 'Assessment Platform', icon: Brain },
  { workspace: 'assessment', page: 'audit-log',          label: 'Audit Log',          group: 'Assessment Platform', icon: ScrollText },

  // Trainer Workspace
  { workspace: 'trainer', page: 'dashboard',             label: 'My Dashboard',       group: 'Trainer Workspace', icon: LayoutDashboard },
  { workspace: 'trainer', page: 'students',              label: 'My Students',        group: 'Trainer Workspace', icon: Users },
  { workspace: 'trainer', page: 'awaiting-review',       label: 'Awaiting Review',    group: 'Trainer Workspace', icon: UserCheck },
  { workspace: 'trainer', page: 'support-plans',         label: 'Support Plans',      group: 'Trainer Workspace', icon: ClipboardList },
  { workspace: 'trainer', page: 'interventions',         label: 'Interventions',      group: 'Trainer Workspace', icon: AlertTriangle },
  { workspace: 'trainer', page: 'results',               label: 'Results',            group: 'Trainer Workspace', icon: BarChart3 },
  { workspace: 'trainer', page: 'evidence',              label: 'Evidence',           group: 'Trainer Workspace', icon: BookOpen },

  // Platform Administration
  { workspace: 'platform_admin', page: 'dashboard',        label: 'Platform Overview',  group: 'Platform Administration', icon: LayoutDashboard },
  { workspace: 'platform_admin', page: 'settings',         label: 'Organisation',       group: 'Platform Administration', icon: Globe },
  { workspace: 'platform_admin', page: 'users',            label: 'Users & Access',     group: 'Platform Administration', icon: Users },
  { workspace: 'platform_admin', page: 'billing',          label: 'Billing & Usage',    group: 'Platform Administration', icon: CreditCard },
  { workspace: 'platform_admin', page: 'axcelerate-inbound', label: 'aXcelerate Sync', group: 'Platform Administration', icon: ArrowDownToLine },
  { workspace: 'platform_admin', page: 'axcelerate-log',   label: 'aXcelerate Log',     group: 'Platform Administration', icon: Plug },
  { workspace: 'platform_admin', page: 'email-activity',   label: 'Email Activity',     group: 'Platform Administration', icon: Mail },
  { workspace: 'platform_admin', page: 'validation',       label: 'Validation',         group: 'Platform Administration', icon: CheckCircle2 },
  { workspace: 'platform_admin', page: 'ai-providers',     label: 'AI Providers',       group: 'Platform Administration', icon: Zap },
  { workspace: 'platform_admin', page: 'feature-flags',    label: 'Feature Flags',      group: 'Platform Administration', icon: Flag },
  { workspace: 'platform_admin', page: 'system-health',    label: 'System Health',      group: 'Platform Administration', icon: Activity },

  // Engineering — AI Technical Director
  { workspace: 'engineering', page: 'mission-control', label: 'AI Technical Director', group: 'Engineering: Director', icon: Brain, keywords: 'ai director executive dashboard briefing' },

  // Engineering — Product Management
  { workspace: 'engineering', page: 'ideas',          label: 'Goals & Epics',       group: 'Engineering: Product', icon: Layers },
  { workspace: 'engineering', page: 'roadmap',        label: 'Roadmap',             group: 'Engineering: Product', icon: Map },
  { workspace: 'engineering', page: 'backlog',        label: 'Ideas & Backlog',     group: 'Engineering: Product', icon: Brain },
  { workspace: 'engineering', page: 'product-audit',  label: 'Feature Health',      group: 'Engineering: Product', icon: ClipboardCheck },

  // Engineering — Engineering
  { workspace: 'engineering', page: 'dev-programme',  label: 'Dev Programme',       group: 'Engineering: Build', icon: Cpu },
  { workspace: 'engineering', page: 'features',       label: 'Features',            group: 'Engineering: Build', icon: Wrench },
  { workspace: 'engineering', page: 'architecture',   label: 'Architecture',        group: 'Engineering: Build', icon: GitBranch },
  { workspace: 'engineering', page: 'documentation',  label: 'Documentation',       group: 'Engineering: Build', icon: FileText },
  { workspace: 'engineering', page: 'qa-testing',     label: 'Testing Framework',   group: 'Engineering: Build', icon: CheckCircle2 },
  { workspace: 'engineering', page: 'release-centre', label: 'Releases',            group: 'Engineering: Build', icon: Package },
  { workspace: 'engineering', page: 'audits',         label: 'Engineering Audits',  group: 'Engineering: Build', icon: Shield },
  { workspace: 'engineering', page: 'arch-guardian',  label: 'Engineering Guardian',group: 'Engineering: Build', icon: ShieldCheckEng },
  { workspace: 'engineering', page: 'change-log',     label: 'Change Log',          group: 'Engineering: Build', icon: History },
  { workspace: 'engineering', page: 'workflow-engine', label: 'Workflow Engine',    group: 'Engineering: Build', icon: GitMerge, keywords: 'lifecycle stages governance gates approvals audit trail artefacts ewle' },
  { workspace: 'engineering', page: 'ai-platform',    label: 'AI Platform',         group: 'Engineering: Build', icon: Sparkles },

  // Engineering — Platform Ops
  { workspace: 'engineering', page: 'pa-general',            label: 'Platform — General',          group: 'Engineering: Platform', icon: Settings },
  { workspace: 'engineering', page: 'pa-integrations',       label: 'Platform — Integrations',     group: 'Engineering: Platform', icon: Plug },
  { workspace: 'engineering', page: 'pa-security',           label: 'Platform — Security',         group: 'Engineering: Platform', icon: Lock },
  { workspace: 'engineering', page: 'pa-environments',       label: 'Platform — Environments',     group: 'Engineering: Platform', icon: Server },
  { workspace: 'engineering', page: 'pa-feature-flags',      label: 'Platform — Feature Flags',    group: 'Engineering: Platform', icon: ToggleLeft },
  { workspace: 'engineering', page: 'pa-monitoring',         label: 'Platform — Monitoring',       group: 'Engineering: Platform', icon: Activity },
  { workspace: 'engineering', page: 'pa-cost-monitoring',    label: 'Platform — Cost Monitoring',  group: 'Engineering: Platform', icon: DollarSign },
  { workspace: 'engineering', page: 'pa-platform-analytics', label: 'Platform — Analytics',        group: 'Engineering: Platform', icon: BarChart3 },
  { workspace: 'engineering', page: 'pa-system-logs',        label: 'Platform — System Logs',      group: 'Engineering: Platform', icon: ScrollText },
];

const WORKSPACE_ICONS: Record<string, typeof Brain> = {
  'Assessment Platform': GraduationCap,
  'Trainer Workspace': UserCheck,
  'Platform Administration': Wrench,
  'Engineering: Director': Brain,
  'Engineering: Product': Map,
  'Engineering: Build': Terminal,
  'Engineering: Platform': Settings,
};

const WORKSPACE_BADGE: Partial<Record<AnyWorkspace, { label: string; cls: string }>> = {
  assessment:     { label: 'Assessment', cls: 'bg-primary-50 text-primary-600' },
  trainer:        { label: 'Trainer', cls: 'bg-emerald-50 text-emerald-600' },
  platform_admin: { label: 'Platform', cls: 'bg-slate-100 text-slate-600' },
  engineering:    { label: 'Engineering', cls: 'bg-blue-100 text-blue-600' },
};

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  currentWorkspace: AnyWorkspace;
}

export function CommandPalette({ isOpen, onClose, currentWorkspace }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = query.trim()
    ? COMMANDS.filter(c => {
        const q = query.toLowerCase();
        return (
          c.label.toLowerCase().includes(q) ||
          c.group.toLowerCase().includes(q) ||
          (c.keywords ?? '').toLowerCase().includes(q) ||
          c.workspace.includes(q)
        );
      })
    : COMMANDS.filter(c => c.workspace === currentWorkspace);

  const navigate = useCallback((cmd: CommandEntry) => {
    setLastWorkspace(cmd.workspace);
    setLastPage(cmd.workspace, cmd.page);
    window.location.hash = workspaceHash(cmd.workspace, cmd.page);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && filtered[selected]) navigate(filtered[selected]);
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [isOpen, filtered, selected, navigate, onClose]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!isOpen) return null;

  const grouped: Record<string, CommandEntry[]> = {};
  filtered.forEach(c => {
    if (!grouped[c.group]) grouped[c.group] = [];
    grouped[c.group].push(c);
  });

  let globalIdx = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 px-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search pages, sections, or workspaces…"
            className="flex-1 text-sm text-slate-900 placeholder-slate-400 bg-transparent outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-0.5 text-slate-400 hover:text-slate-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-500 rounded border border-slate-200">esc</kbd>
        </div>

        <div ref={listRef} className="overflow-y-auto max-h-96 py-1">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-sm text-slate-400">No results for "{query}"</div>
          )}

          {Object.entries(grouped).map(([group, items]) => {
            const GroupIcon = WORKSPACE_ICONS[group] ?? ArrowRight;
            return (
              <div key={group}>
                <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                  <GroupIcon className="w-3 h-3 text-slate-400 shrink-0" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{group}</p>
                </div>
                {items.map(cmd => {
                  const Icon = cmd.icon;
                  const idx = globalIdx++;
                  const isSel = idx === selected;
                  const isCrossWorkspace = cmd.workspace !== currentWorkspace;
                  const badge = isCrossWorkspace ? WORKSPACE_BADGE[cmd.workspace] : undefined;
                  return (
                    <button
                      key={`${cmd.workspace}-${cmd.page}`}
                      data-idx={idx}
                      onClick={() => navigate(cmd)}
                      onMouseEnter={() => setSelected(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSel ? 'bg-blue-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isSel ? 'bg-blue-100' : 'bg-slate-100'
                      }`}>
                        <Icon className={`w-3.5 h-3.5 ${isSel ? 'text-blue-600' : 'text-slate-500'}`} />
                      </div>
                      <span className={`flex-1 text-sm font-medium ${isSel ? 'text-blue-700' : 'text-slate-700'}`}>
                        {cmd.label}
                      </span>
                      {badge && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                      {isSel && <ArrowRight className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-4 bg-slate-50/60">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <kbd className="px-1 py-0.5 font-mono bg-white border border-slate-200 rounded text-[9px]">↑↓</kbd>
            navigate
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <kbd className="px-1 py-0.5 font-mono bg-white border border-slate-200 rounded text-[9px]">↵</kbd>
            open
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <kbd className="px-1.5 py-0.5 font-mono bg-white border border-slate-200 rounded text-[9px]">esc</kbd>
            close
          </div>
          <div className="ml-auto text-[10px] text-slate-400">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>
  );
}
