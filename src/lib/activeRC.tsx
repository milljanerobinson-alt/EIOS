import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveRC {
  id: string;
  rc_number: string;
  phase_name: string;
  version: string | null;
  status: string;
  description: string | null;
  milestone: string | null;
  due_date: string | null;
  included_backlog_item_ids: string[];
  linked_journal_ids: string[];
  linked_testing_ids: string[];
  linked_adr_ids: string[];
  linked_doc_ids: string[];
  checklist_items: ChecklistItem[];
  is_active: boolean;
}

export interface HistoricalException {
  reason: string;
  approved_by: string;
  date_approved: string;
  adr_id?: string | null;
  notes?: string | null;
}

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  checked: boolean;
  historical_exception?: HistoricalException | null;
}

interface ActiveRCContextValue {
  activeRC: ActiveRC | null;
  loading: boolean;
  refresh: () => Promise<void>;
  addToActiveRC: (entityType: 'backlog' | 'journal' | 'testing' | 'adr' | 'doc', entityId: string) => Promise<void>;
  logEvent: (params: LogEventParams) => Promise<void>;
}

interface LogEventParams {
  event_type: string;
  event_label: string;
  entity_type?: string;
  entity_id?: string;
  entity_title?: string;
  metadata?: Record<string, unknown>;
}

const ActiveRCContext = createContext<ActiveRCContextValue>({
  activeRC: null,
  loading: true,
  refresh: async () => {},
  addToActiveRC: async () => {},
  logEvent: async () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ActiveRCProvider({ children }: { children: ReactNode }) {
  const [activeRC, setActiveRC] = useState<ActiveRC | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('ecc_release_candidates')
      .select('id,rc_number,phase_name,version,status,description,milestone,due_date,included_backlog_item_ids,linked_journal_ids,linked_testing_ids,linked_adr_ids,linked_doc_ids,checklist_items,is_active')
      .eq('is_active', true)
      .maybeSingle();
    setActiveRC(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const logEvent = useCallback(async (params: LogEventParams) => {
    const rc = activeRC;
    await supabase.from('ecc_engineering_audit').insert({
      event_type:   params.event_type,
      event_label:  params.event_label,
      entity_type:  params.entity_type ?? null,
      entity_id:    params.entity_id ?? null,
      entity_title: params.entity_title ?? null,
      rc_id:        rc?.id ?? null,
      rc_number:    rc?.rc_number ?? null,
      metadata:     params.metadata ?? {},
    });
  }, [activeRC]);

  const addToActiveRC = useCallback(async (
    entityType: 'backlog' | 'journal' | 'testing' | 'adr' | 'doc',
    entityId: string,
  ) => {
    if (!activeRC) return;
    const colMap: Record<string, keyof ActiveRC> = {
      backlog:  'included_backlog_item_ids',
      journal:  'linked_journal_ids',
      testing:  'linked_testing_ids',
      adr:      'linked_adr_ids',
      doc:      'linked_doc_ids',
    };
    const col = colMap[entityType] as string;
    const existing = (activeRC[col as keyof ActiveRC] as string[]) ?? [];
    if (existing.includes(entityId)) return;
    const updated = [...existing, entityId];
    const now = new Date().toISOString();
    await supabase
      .from('ecc_release_candidates')
      .update({ [col]: updated, updated_at: now })
      .eq('id', activeRC.id);

    // Bidirectional back-link from entity to RC
    const rcId = activeRC.id;
    if (entityType === 'backlog') {
      const { data: row } = await supabase.from('ecc_backlog_items').select('linked_release_ids').eq('id', entityId).maybeSingle();
      const prev = (row?.linked_release_ids as string[]) ?? [];
      if (!prev.includes(rcId)) {
        await supabase.from('ecc_backlog_items').update({ linked_release_ids: [...prev, rcId], updated_at: now }).eq('id', entityId);
      }
    } else if (entityType === 'journal') {
      const { data: row } = await supabase.from('ecc_ai_journal').select('linked_rc_ids').eq('id', entityId).maybeSingle();
      const prev = (row?.linked_rc_ids as string[]) ?? [];
      if (!prev.includes(rcId)) {
        await supabase.from('ecc_ai_journal').update({ linked_rc_ids: [...prev, rcId], updated_at: now }).eq('id', entityId);
      }
    } else if (entityType === 'testing') {
      const { data: row } = await supabase.from('ecc_testing_reports').select('linked_release_ids').eq('id', entityId).maybeSingle();
      const prev = (row?.linked_release_ids as string[]) ?? [];
      if (!prev.includes(rcId)) {
        await supabase.from('ecc_testing_reports').update({ linked_release_ids: [...prev, rcId], updated_at: now }).eq('id', entityId);
      }
    } else if (entityType === 'doc') {
      const { data: row } = await supabase.from('ecc_documentation').select('linked_release_ids').eq('id', entityId).maybeSingle();
      const prev = (row?.linked_release_ids as string[]) ?? [];
      if (!prev.includes(rcId)) {
        await supabase.from('ecc_documentation').update({ linked_release_ids: [...prev, rcId], updated_at: now }).eq('id', entityId);
      }
    }

    await refresh();
  }, [activeRC, refresh]);

  return (
    <ActiveRCContext.Provider value={{ activeRC, loading, refresh, addToActiveRC, logEvent }}>
      {children}
    </ActiveRCContext.Provider>
  );
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useActiveRC() {
  return useContext(ActiveRCContext);
}
