import { supabase } from './supabase';

export type ProjectStatus = 'active' | 'archived' | 'paused';

export type WorkspaceMode = 'platform' | 'project';

export interface ActiveContext {
  context_type: 'platform' | 'project';
  context_id: string;
  project_id: string | null;
  label: string;
}

export interface EccProject {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  is_default: boolean;
  icon_key: string | null;
  colour: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const STORAGE_KEYS = {
  workspaceMode:   'atd_workspace_mode',
  activeProjectId: 'atd_active_project_id',
  recentProjects:  'atd_recent_projects',
} as const;

const MAX_RECENTS = 5;

// ─── Storage helpers ──────────────────────────────────────────────────────────

function readLS<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

function writeLS<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* */ }
}

// ─── Project Registry ─────────────────────────────────────────────────────────

async function listProjects(): Promise<EccProject[]> {
  const { data, error } = await supabase
    .from('ecc_projects')
    .select('*')
    .eq('status', 'active')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as EccProject[];
}

async function getProject(id: string): Promise<EccProject | null> {
  const { data } = await supabase
    .from('ecc_projects')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as EccProject | null;
}

async function getDefaultProject(): Promise<EccProject | null> {
  const { data } = await supabase
    .from('ecc_projects')
    .select('*')
    .eq('is_default', true)
    .eq('status', 'active')
    .maybeSingle();
  if (data) return data as EccProject;
  // Fallback to first active project
  const { data: first } = await supabase
    .from('ecc_projects')
    .select('*')
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  return first as EccProject | null;
}

// ─── Active workspace/project persistence ────────────────────────────────────

function getWorkspaceMode(): WorkspaceMode {
  return readLS<WorkspaceMode>(STORAGE_KEYS.workspaceMode, 'platform');
}

function setWorkspaceMode(mode: WorkspaceMode): void {
  writeLS(STORAGE_KEYS.workspaceMode, mode);
}

function getActiveProjectId(): string | null {
  return readLS<string | null>(STORAGE_KEYS.activeProjectId, null);
}

function setActiveProjectId(id: string): void {
  writeLS(STORAGE_KEYS.activeProjectId, id);
  // Add to recents
  const prev = readLS<string[]>(STORAGE_KEYS.recentProjects, []);
  const next = [id, ...prev.filter(p => p !== id)].slice(0, MAX_RECENTS);
  writeLS(STORAGE_KEYS.recentProjects, next);
}

function getRecentProjectIds(): string[] {
  return readLS<string[]>(STORAGE_KEYS.recentProjects, []);
}

// ─── Resolved active context ──────────────────────────────────────────────────

async function resolveActiveProject(): Promise<EccProject | null> {
  const savedId = getActiveProjectId();
  if (savedId) {
    const project = await getProject(savedId);
    if (project && project.status === 'active') return project;
  }
  const def = await getDefaultProject();
  if (def) setActiveProjectId(def.id);
  return def;
}

async function resolveActiveContext(): Promise<ActiveContext> {
  const mode = getWorkspaceMode();
  if (mode === 'platform') {
    return { context_type: 'platform', context_id: 'platform', project_id: null, label: 'Platform' };
  }
  const project = await resolveActiveProject();
  if (!project) {
    return { context_type: 'platform', context_id: 'platform', project_id: null, label: 'Platform' };
  }
  return {
    context_type: 'project',
    context_id: project.id,
    project_id: project.id,
    label: project.name,
  };
}

// ─── Public service object ────────────────────────────────────────────────────

export const ActiveProjectService = {
  listProjects,
  getProject,
  getDefaultProject,
  getWorkspaceMode,
  setWorkspaceMode,
  getActiveProjectId,
  setActiveProjectId,
  getRecentProjectIds,
  resolveActiveProject,
  resolveActiveContext,
};
