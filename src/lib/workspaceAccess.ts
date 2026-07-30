import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';

export type CustomerWorkspace = 'assessment' | 'trainer' | 'platform_admin';
export type AnyWorkspace = CustomerWorkspace | 'engineering';

export interface WorkspaceAccess {
  workspace: CustomerWorkspace;
  is_primary: boolean;
}

export interface UseWorkspaceAccessResult {
  workspaces: WorkspaceAccess[];
  primaryWorkspace: CustomerWorkspace;
  hasWorkspace: (ws: CustomerWorkspace) => boolean;
  loading: boolean;
}

export function useWorkspaceAccess(): UseWorkspaceAccessResult {
  const { user, profile } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceAccess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    load();
  }, [user?.id]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('user_workspace_access')
      .select('workspace, is_primary')
      .eq('user_id', user!.id)
      .order('is_primary', { ascending: false });

    if (data && data.length > 0) {
      setWorkspaces(data as WorkspaceAccess[]);
    } else {
      // Fallback: derive from role if no DB rows exist yet
      const fallback = deriveFromRole(profile?.role ?? 'admin');
      setWorkspaces(fallback);
    }
    setLoading(false);
  }

  const primaryWorkspace: CustomerWorkspace =
    workspaces.find(w => w.is_primary)?.workspace ??
    workspaces[0]?.workspace ??
    'assessment';

  function hasWorkspace(ws: CustomerWorkspace) {
    return workspaces.some(w => w.workspace === ws);
  }

  return { workspaces, primaryWorkspace, hasWorkspace, loading };
}

function deriveFromRole(role: string): WorkspaceAccess[] {
  if (role === 'admin') {
    return [
      { workspace: 'assessment', is_primary: true },
      { workspace: 'trainer', is_primary: false },
      { workspace: 'platform_admin', is_primary: false },
    ];
  }
  if (role === 'trainer') {
    return [
      { workspace: 'assessment', is_primary: false },
      { workspace: 'trainer', is_primary: true },
    ];
  }
  return [{ workspace: 'assessment', is_primary: true }];
}

// Storage helpers
export function getLastWorkspace(): AnyWorkspace {
  return (localStorage.getItem('ecc_workspace') as AnyWorkspace) || 'engineering';
}

export function setLastWorkspace(ws: AnyWorkspace) {
  localStorage.setItem('ecc_workspace', ws);
}

export function getLastPage(ws: AnyWorkspace): string {
  return localStorage.getItem(`ecc_workspace_page_${ws}`) || defaultPage(ws);
}

export function setLastPage(ws: AnyWorkspace, page: string) {
  localStorage.setItem(`ecc_workspace_page_${ws}`, page);
}

function defaultPage(ws: AnyWorkspace): string {
  switch (ws) {
    case 'assessment':    return 'dashboard';
    case 'trainer':       return 'dashboard';
    case 'platform_admin':return 'dashboard';
    case 'engineering':   return 'mission-control';
  }
}

export function workspaceHash(ws: AnyWorkspace, page: string): string {
  switch (ws) {
    case 'engineering':    return `#/engineering/${page}`;
    case 'assessment':     return `#/assessment/${page}`;
    case 'trainer':        return `#/trainer/${page}`;
    case 'platform_admin': return `#/platform/${page}`;
  }
}
