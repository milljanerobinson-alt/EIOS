/**
 * Plugin Manager — TP-018 Skeleton
 * Skeleton framework for future plugin loading.
 * Enables third-party products and domain modules to extend ATD Core
 * without modifying platform code.
 */

import { supabase } from './supabase';

export const PLUGIN_MANAGER_VERSION = '0.1';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PluginType = 'product_plugin' | 'integration' | 'extension';
export type PluginStatus = 'registered' | 'active' | 'disabled';
export type PluginPermission =
  | 'read:eig'
  | 'write:eig'
  | 'read:reviews'
  | 'write:reviews'
  | 'read:test_plans'
  | 'write:test_plans'
  | 'read:benchmarks'
  | 'write:benchmarks'
  | 'read:roadmap'
  | 'write:roadmap'
  | 'read:decisions'
  | 'write:decisions';

export interface PluginManifest {
  name: string;
  slug: string;
  version: string;
  plugin_type: PluginType;
  entry_point: string;
  permissions: PluginPermission[];
  loaded_modules: string[];
  description?: string;
  author?: string;
}

export interface PluginLoadResult {
  success: boolean;
  plugin_slug: string;
  message: string;
  loaded_at: string | null;
}

export interface PluginContext {
  supabase_url: string;
  supabase_anon_key: string;
  platform_version: string;
  available_modules: string[];
  granted_permissions: PluginPermission[];
}

// ─── Plugin Registration ──────────────────────────────────────────────────────

export async function registerPlugin(manifest: PluginManifest): Promise<PluginLoadResult> {
  const { data: existing } = await supabase
    .from('ecc_plugin_registry')
    .select('id, status')
    .eq('slug', manifest.slug)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      plugin_slug: manifest.slug,
      message: `Plugin '${manifest.slug}' is already registered with status: ${existing.status}`,
      loaded_at: null,
    };
  }

  const { error } = await supabase.from('ecc_plugin_registry').insert({
    name: manifest.name,
    slug: manifest.slug,
    plugin_type: manifest.plugin_type,
    status: 'registered',
    entry_point: manifest.entry_point,
    permissions: manifest.permissions,
    loaded_modules: manifest.loaded_modules,
    metadata: {
      version: manifest.version,
      description: manifest.description ?? '',
      author: manifest.author ?? '',
    },
  });

  if (error) {
    return { success: false, plugin_slug: manifest.slug, message: error.message, loaded_at: null };
  }

  return {
    success: true,
    plugin_slug: manifest.slug,
    message: `Plugin '${manifest.name}' registered successfully.`,
    loaded_at: new Date().toISOString(),
  };
}

// ─── Plugin Loading (future) ──────────────────────────────────────────────────

export async function activatePlugin(slug: string): Promise<PluginLoadResult> {
  const { data } = await supabase
    .from('ecc_plugin_registry')
    .select('id, name, status')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) {
    return { success: false, plugin_slug: slug, message: `Plugin '${slug}' not found in registry.`, loaded_at: null };
  }

  if (data.status === 'active') {
    return { success: false, plugin_slug: slug, message: `Plugin '${slug}' is already active.`, loaded_at: null };
  }

  await supabase
    .from('ecc_plugin_registry')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    success: true,
    plugin_slug: slug,
    message: `Plugin '${data.name}' activated. Full dynamic loading requires Plugin SDK (planned).`,
    loaded_at: new Date().toISOString(),
  };
}

export async function deactivatePlugin(slug: string): Promise<PluginLoadResult> {
  const { data } = await supabase
    .from('ecc_plugin_registry')
    .select('id, name, status')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) {
    return { success: false, plugin_slug: slug, message: `Plugin '${slug}' not found.`, loaded_at: null };
  }

  await supabase
    .from('ecc_plugin_registry')
    .update({ status: 'disabled', updated_at: new Date().toISOString() })
    .eq('id', data.id);

  return {
    success: true,
    plugin_slug: slug,
    message: `Plugin '${data.name}' deactivated.`,
    loaded_at: new Date().toISOString(),
  };
}

// ─── Permission Validation ────────────────────────────────────────────────────

export function validatePluginPermission(
  plugin_permissions: string[],
  required: PluginPermission,
): boolean {
  return plugin_permissions.includes(required);
}

export function buildPluginContext(
  plugin_permissions: string[],
  available_modules: string[],
): PluginContext {
  return {
    supabase_url: import.meta.env.VITE_SUPABASE_URL ?? '',
    supabase_anon_key: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    platform_version: PLUGIN_MANAGER_VERSION,
    available_modules,
    granted_permissions: (plugin_permissions as PluginPermission[]).filter(p =>
      ['read:eig','write:eig','read:reviews','write:reviews','read:test_plans',
       'write:test_plans','read:benchmarks','write:benchmarks',
       'read:roadmap','write:roadmap','read:decisions','write:decisions'].includes(p)
    ),
  };
}

// ─── Plugin Listing ───────────────────────────────────────────────────────────

export async function listPlugins() {
  const { data } = await supabase
    .from('ecc_plugin_registry')
    .select('*')
    .order('created_at', { ascending: true });
  return data ?? [];
}
