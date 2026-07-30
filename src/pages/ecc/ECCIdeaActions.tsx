// EWO-032R.10 — Engineering Idea dashboard actions: detail drawer, action menu,
// delete-eligibility, and promotion helper. No new route; no new backend pipeline.

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  X, MoreVertical, Eye, Archive, ArrowUpRight, Trash2, Sparkles,
  ExternalLink, Lightbulb, Shield, Zap, Brain, Clock, Tag, Package,
  AlertCircle, CheckCircle2, Loader2, RotateCcw, GitBranch, Layers,
  MessageSquare,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ensureEngineeringWorkOrderExists } from '../../lib/ensureEngineeringWorkOrder';
import { LifecycleProgress } from '../../components/LifecycleProgress';
import {
  type EngineeringIdea, type IdeaStatus,
  IDEA_STATUS_CFG, IDEA_PRIORITY_CFG, IDEA_CATEGORY_CFG,
} from './ECCIdeaTypes';

// ─── Delete eligibility ──────────────────────────────────────────────────────

export interface DeleteEligibility {
  eligible: boolean;
  reasons: string[];
  hasEwoRefs: boolean;
  hasSession: boolean;
  hasEvidence: boolean;
  hasRecords: boolean;
  hasAudit: boolean;
  cascadeAvailable: boolean;
  cascadeSummary: CascadeSummary | null;
}

export interface CascadeSummary {
  totalToDelete: number;
  deletableTypes: Array<{ type: string; count: number }>;
  retainedTypes: Array<{ type: string; count: number }>;
  blockingObjects: Array<{ objectType: string; objectRef: string; reason: string }>;
}

export async function checkDeleteEligibility(idea: EngineeringIdea): Promise<DeleteEligibility> {
  const reasons: string[] = [];
  let hasEwoRefs = false, hasSession = false, hasEvidence = false, hasRecords = false, hasAudit = false;

  const deletableTypes: Array<{ type: string; count: number }> = [];
  const retainedTypes: Array<{ type: string; count: number }> = [];
  const blockingObjects: Array<{ objectType: string; objectRef: string; reason: string }> = [];

  // Quick local flags from the idea object (no DB queries needed)
  if (idea.related_ewo_refs && idea.related_ewo_refs.length > 0) {
    hasEwoRefs = true;
    reasons.push(`Linked to ${idea.related_ewo_refs.length} Engineering Work Order(s): ${idea.related_ewo_refs.join(', ')}`);
  }
  if (idea.session_id) {
    hasSession = true;
  }

  // ── Registry-driven dependency resolution ──
  // Instead of hard-coding table queries (which caused a regression when
  // the audit table name was wrong), we delegate to the
  // resolve_dependency_graph RPC which reads the governed_dependency_registry
  // and resolves the complete graph server-side. The RPC returns
  // display_name and governance metadata directly from the registry —
  // the frontend never needs to map physical table names.
  if (idea.id) {
    const { data: graphResult, error } = await supabase.rpc('resolve_dependency_graph', {
      p_root_type: 'engineering_idea',
      p_root_id: idea.id,
    });

    if (!error && graphResult) {
      const graph = graphResult as {
        success: boolean;
        total_to_delete?: number;
        cascade_available?: boolean;
        blocking_count?: number;
        blocking_objects?: Array<{ object_type: string; display_name?: string; object_ref: string; reason: string }>;
        deletable_types?: Array<{ object_type: string; display_name: string; count: number; delete_order: number; deletion_policy: string; retention_policy: string; cascade_participation: string }>;
        retained_types?: Array<{ object_type: string; display_name: string; count: number; retention_policy: string; cascade_participation: string }>;
        audit_trail_count?: number;
      };

      if (graph.success) {
        // Map blocking objects from registry output (display_name comes from RPC)
        if (graph.blocking_objects && graph.blocking_objects.length > 0) {
          for (const b of graph.blocking_objects) {
            blockingObjects.push({
              objectType: b.display_name ?? b.object_type,
              objectRef: b.object_ref,
              reason: b.reason,
            });
          }
        }

        // Map deletable types from registry output (display_name comes from RPC)
        if (graph.deletable_types) {
          for (const entry of graph.deletable_types) {
            if (entry.count > 0 && entry.object_type !== 'engineering_idea') {
              deletableTypes.push({ type: entry.display_name, count: entry.count });
            }
            if (entry.object_type === 'execution_evidence' && entry.count > 0) {
              hasEvidence = true;
              reasons.push(`${entry.count} execution evidence record(s) linked`);
            }
            if (entry.object_type === 'engineering_record' && entry.count > 0) {
              hasRecords = true;
              reasons.push(`${entry.count} records-library entry(ies) reference this Idea`);
            }
          }
        }

        // Map retained types from registry output (display_name comes from RPC)
        if (graph.retained_types) {
          for (const entry of graph.retained_types) {
            if (entry.count > 0) {
              retainedTypes.push({ type: entry.display_name, count: entry.count });
            }
            if (entry.object_type === 'audit_trail' && entry.count > 0) {
              hasAudit = true;
              reasons.push(`${entry.count} audit trail entry(ies) reference this Idea`);
            }
          }
        }
      }
    }
  }

  const eligible = !hasEwoRefs && !hasSession && !hasEvidence && !hasRecords && !hasAudit;

  const hasDependencies = hasEwoRefs || hasEvidence || hasRecords;
  const cascadeAvailable = hasDependencies && blockingObjects.length === 0 && !eligible;

  const cascadeSummary: CascadeSummary | null = cascadeAvailable ? {
    totalToDelete: deletableTypes.reduce((sum, t) => sum + t.count, 0) + 1,
    deletableTypes,
    retainedTypes,
    blockingObjects,
  } : null;

  return { eligible, reasons, hasEwoRefs, hasSession, hasEvidence, hasRecords, hasAudit, cascadeAvailable, cascadeSummary };
}


// ─── Promotion service ─────────────────────────────────────────────────────────

export interface PromotionResult {
  success: boolean;
  ewoRef: string | null;
  error: string | null;
}

export async function promoteIdeaToEwo(idea: EngineeringIdea): Promise<PromotionResult> {
  try {
    // Determine next EWO reference
    const { data: maxRow } = await supabase
      .from('engineering_work_orders')
      .select('ewo_ref')
      .order('ewo_ref', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextNum = 1;
    if (maxRow?.ewo_ref) {
      const m = maxRow.ewo_ref.match(/^EWO-(\d+)/i);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const ewoRef = `EWO-${String(nextNum).padStart(3, '0')}`;

    const result = await ensureEngineeringWorkOrderExists(
      ewoRef,
      idea.title,
      idea.description || idea.title,
      {
        priority: idea.priority === 'critical' ? 'critical'
                : idea.priority === 'high' ? 'high'
                : idea.priority === 'low' ? 'low' : 'medium',
        riskLevel: 'low',
        implementationProvider: 'codex',
      },
    );

    if (result.success && result.ewoRef) {
      // Link the EWO back to the Idea and mark as promoted
      const newRefs = [...new Set([...(idea.related_ewo_refs ?? []), result.ewoRef])];
      await supabase.from('engineering_idea').update({
        related_ewo_refs: newRefs,
        status: 'promoted',
      }).eq('id', idea.id);

      // Record promotion evidence if a session exists
      if (idea.session_id) {
        await supabase.from('execution_evidence').insert({
          session_id: idea.session_id,
          evidence_type: 'governance_artefact',
          evidence_ref: `EWO-PROMOTE-${result.ewoRef}-${Date.now()}`,
          description: `Governed Engineering Work Order ${result.ewoRef} created via canonical promotion — Idea ${idea.idea_ref} promoted into EWO lifecycle.`,
          source: 'idea_workspace_promotion',
          artefact_ref: result.ewoRef,
          verified: true,
          metadata: {
            ewo_id: result.ewoId,
            ewo_ref: result.ewoRef,
            idea_id: idea.id,
            idea_ref: idea.idea_ref,
            promotion_stage: 'ewo_032r10',
            created: result.created,
          },
        });
      }

      return { success: true, ewoRef: result.ewoRef, error: null };
    }

    return { success: false, ewoRef: null, error: result.error ?? 'Unknown EWO creation error' };
  } catch (e) {
    return { success: false, ewoRef: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ─── Action definitions ────────────────────────────────────────────────────────

export type IdeaAction =
  | 'open' | 'continue' | 'queue' | 'promote' | 'archive' | 'restore' | 'delete' | 'view-ewo';

interface ActionDef {
  key: IdeaAction;
  label: string;
  icon: typeof Eye;
  colour: string;
  destructive?: boolean;
}

export function actionsForStatus(status: IdeaStatus): ActionDef[] {
  switch (status) {
    case 'draft':
    case 'active':
      return [
        { key: 'open',      label: 'View in Conversation', icon: MessageSquare, colour: 'text-blue-600' },
        { key: 'open',      label: 'Open',                 icon: Eye,         colour: 'text-slate-600' },
        { key: 'continue',  label: 'Use Wizard (Admin)',   icon: Sparkles,     colour: 'text-slate-400' },
        { key: 'queue',     label: 'Queue for Promotion',  icon: ArrowUpRight,colour: 'text-amber-600' },
        { key: 'archive',   label: 'Archive',              icon: Archive,     colour: 'text-slate-600' },
        { key: 'delete',    label: 'Delete',               icon: Trash2,      colour: 'text-red-600', destructive: true },
      ];
    case 'queued_for_promotion':
      return [
        { key: 'open',      label: 'View in Conversation', icon: MessageSquare, colour: 'text-blue-600' },
        { key: 'open',    label: 'Open',      icon: Eye,         colour: 'text-slate-600' },
        { key: 'promote', label: 'Promote',  icon: GitBranch,   colour: 'text-emerald-600' },
        { key: 'archive', label: 'Archive',  icon: Archive,     colour: 'text-slate-600' },
      ];
    case 'promoted':
      return [
        { key: 'open',      label: 'View in Conversation', icon: MessageSquare, colour: 'text-blue-600' },
        { key: 'open',     label: 'Open',     icon: Eye,         colour: 'text-slate-600' },
        { key: 'view-ewo', label: 'View EWO', icon: ExternalLink,colour: 'text-violet-600' },
        { key: 'archive',  label: 'Archive', icon: Archive,     colour: 'text-slate-600' },
      ];
    case 'archived':
    case 'superseded':
      return [
        { key: 'open',    label: 'Open',     icon: Eye,      colour: 'text-slate-600' },
        { key: 'restore', label: 'Restore', icon: RotateCcw,colour: 'text-blue-600' },
        { key: 'delete',  label: 'Delete',   icon: Trash2,   colour: 'text-red-600', destructive: true },
      ];
    default:
      return [{ key: 'open', label: 'Open', icon: Eye, colour: 'text-slate-600' }];
  }
}

// ─── Action Menu (per-card dropdown) ────────────────────────────────────────────

export function IdeaActionMenu({
  idea,
  onAction,
}: {
  idea: EngineeringIdea;
  onAction: (action: IdeaAction, idea: EngineeringIdea) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const actions = actionsForStatus(idea.status);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label="Idea actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-8 z-20 w-48 bg-white border border-slate-200 rounded-lg shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {actions.map(act => {
            const Icon = act.icon;
            return (
              <button
                key={act.key}
                onClick={() => { setOpen(false); onAction(act.key, idea); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-slate-50 transition-colors ${act.colour} ${act.destructive ? 'hover:bg-red-50' : ''}`}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                {act.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Detail Drawer ───────────────────────────────────────────────────────────────

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-400 flex-shrink-0">{label}</span>
      <span className={`text-xs text-slate-700 text-right ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

export function IdeaDetailDrawer({
  idea,
  onClose,
  onNavigateToEwo,
  onContinueWizard,
  onPromote,
}: {
  idea: EngineeringIdea | null;
  onClose: () => void;
  onNavigateToEwo: (ewoRef: string) => void;
  onContinueWizard: () => void;
  onPromote: () => void;
}) {
  if (!idea) return null;

  const statusCfg = IDEA_STATUS_CFG[idea.status];
  const priCfg = IDEA_PRIORITY_CFG[idea.priority];
  const catCfg = IDEA_CATEGORY_CFG[idea.category];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-start justify-between gap-2 z-10">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Lightbulb className="w-4 h-4 text-amber-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-800 leading-tight">{idea.title}</h2>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{idea.idea_ref}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-5">
          {/* Description */}
          {idea.description && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Description</p>
              <p className="text-sm text-slate-700 leading-relaxed">{idea.description}</p>
            </div>
          )}

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 ${priCfg.text}`}>
              <span className={`w-2 h-2 rounded-full ${priCfg.dot}`} />
              {priCfg.label} Priority
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-600">
              {catCfg.label}
            </span>
          </div>

          {/* Lifecycle Progress */}
          <LifecycleProgress
            idea={idea}
            onNavigateToEwo={onNavigateToEwo}
            onContinueWizard={onContinueWizard}
            onPromote={onPromote}
          />

          {/* Governance metadata */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Governance Metadata</p>
            <div className="space-y-0">
              <DetailRow label="Guardian Validated" value={
                idea.guardian_validated
                  ? <span className="flex items-center gap-1 text-emerald-600"><Shield className="w-3 h-3" /> Yes</span>
                  : <span className="text-slate-400">No</span>
              } />
              <DetailRow label="Memory Search" value={
                idea.memory_search_performed
                  ? <span className="flex items-center gap-1 text-violet-600"><Brain className="w-3 h-3" /> Performed</span>
                  : <span className="text-slate-400">Not performed</span>
              } />
              <DetailRow label="Duplicates Checked" value={idea.duplicates_checked ? 'Yes' : 'No'} />
              {idea.guardian_session_id && (
                <DetailRow label="Guardian Session" value={idea.guardian_session_id.slice(0, 8)} mono />
              )}
              {idea.similarity_decision && (
                <DetailRow label="Similarity Decision" value={idea.similarity_decision.replace(/_/g, ' ')} />
              )}
              {idea.similarity_top_match_ref && (
                <DetailRow label="Top Similarity Match" value={idea.similarity_top_match_ref} mono />
              )}
            </div>
          </div>

          {/* Linked EWOs */}
          <div className="bg-violet-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <GitBranch className="w-3 h-3" /> Linked Engineering Work Orders
            </p>
            {idea.related_ewo_refs && idea.related_ewo_refs.length > 0 ? (
              <div className="space-y-1.5">
                {idea.related_ewo_refs.map(ref => (
                  <button
                    key={ref}
                    onClick={() => onNavigateToEwo(ref)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-white rounded-lg border border-violet-100 hover:border-violet-300 hover:shadow-sm transition-all group"
                  >
                    <span className="text-xs font-mono font-semibold text-violet-700">{ref}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-violet-400 group-hover:text-violet-600 transition-colors" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No linked Engineering Work Orders.</p>
            )}
          </div>

          {/* Execution references */}
          {(idea.session_id || idea.intent_id || idea.objective_id) && (
            <div className="bg-blue-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Execution References
              </p>
              <div className="space-y-0">
                {idea.session_id && <DetailRow label="Session" value={idea.session_id.slice(0, 8)} mono />}
                {idea.intent_id && <DetailRow label="Intent" value={idea.intent_id.slice(0, 8)} mono />}
                {idea.objective_id && <DetailRow label="Objective" value={idea.objective_id.slice(0, 8)} mono />}
              </div>
            </div>
          )}

          {/* Products & Applications */}
          {(idea.products.length > 0 || idea.applications.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Package className="w-3 h-3" /> Products & Applications
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...idea.products, ...idea.applications].map((p, i) => (
                  <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{p}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {idea.tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Tag className="w-3 h-3" /> Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {idea.tags.map(t => (
                  <span key={t} className="text-xs bg-slate-50 border border-slate-200 text-slate-500 px-2 py-0.5 rounded">#{t}</span>
                ))}
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="bg-slate-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Timestamps
            </p>
            <DetailRow label="Created" value={new Date(idea.created_at).toLocaleString()} />
            <DetailRow label="Updated" value={new Date(idea.updated_at).toLocaleString()} />
            <DetailRow label="Created By" value={idea.created_by} mono />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirmation Modal ─────────────────────────────────────────────────

export function IdeaDeleteModal({
  idea,
  onClose,
  onConfirm,
}: {
  idea: EngineeringIdea;
  onClose: () => void;
  onConfirm: (reason: string, eligibility: DeleteEligibility) => Promise<void>;
}) {
  const [eligibility, setEligibility] = useState<DeleteEligibility | null>(null);
  const [checking, setChecking] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let cancelled = false;
    checkDeleteEligibility(idea)
      .then(elig => { if (!cancelled) { setEligibility(elig); setChecking(false); } })
      .catch(() => { if (!cancelled) { setEligibility({ eligible: false, reasons: ['Failed to check dependencies'], hasEwoRefs: false, hasSession: false, hasEvidence: false, hasRecords: false, hasAudit: false }); setChecking(false); } });
    return () => { cancelled = true; };
  }, [idea]);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(reason.trim(), eligibility!);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deletion failed');
    } finally {
      setDeleting(false);
    }
  };

  const blocked = eligibility && !eligibility.eligible && !eligibility.cascadeAvailable;
  const cascade = eligibility && eligibility.cascadeAvailable;
  const reasonMissing = reason.trim().length < 10;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 bg-red-50">
          <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-900">Delete this Engineering Idea?</p>
            <p className="text-[10px] font-mono text-red-600">{idea.idea_ref}</p>
          </div>
          <button onClick={onClose} disabled={deleting} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {checking ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
              <span className="text-xs text-slate-500">Checking governance relationships...</span>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-600">
                You are about to permanently delete <strong>{idea.title}</strong>.
              </p>

              {blocked ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="text-xs font-semibold text-amber-800 mb-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> Deletion Blocked — Governed Relationships Exist
                  </p>
                  <div className="space-y-1">
                    {eligibility!.reasons.map((r, i) => (
                      <p key={i} className="text-[10px] text-amber-700 leading-relaxed">· {r}</p>
                    ))}
                  </div>
                  {eligibility!.cascadeSummary && eligibility!.cascadeSummary.blockingObjects.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-amber-200">
                      <p className="text-[10px] font-semibold text-amber-800 mb-1">Non-test dependencies blocking cascade:</p>
                      {eligibility!.cascadeSummary.blockingObjects.map((b, i) => (
                        <p key={i} className="text-[10px] text-amber-700">· {b.objectType} ({b.objectRef}): {b.reason}</p>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-amber-700 mt-2 font-medium">
                    Archive this Idea instead to preserve governance and audit history.
                  </p>
                </div>
              ) : cascade ? (
                <>
                  <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-violet-800 mb-1.5 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" /> Cascade Deletion Available
                    </p>
                    <p className="text-[10px] text-violet-700 mb-2">
                      This Test Engineering Idea has {eligibility!.cascadeSummary!.totalToDelete - 1} dependent Test Artefact(s).
                    </p>
                    <p className="text-[10px] font-semibold text-violet-800 mb-1">The following objects will be permanently deleted:</p>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-violet-700">· Engineering Idea (1)</p>
                      {eligibility!.cascadeSummary!.deletableTypes.map((t, i) => (
                        <p key={i} className="text-[10px] text-violet-700">· {t.type} ({t.count})</p>
                      ))}
                    </div>
                    {eligibility!.cascadeSummary!.retainedTypes.length > 0 && (
                      <>
                        <p className="text-[10px] font-semibold text-slate-600 mt-2 mb-1">The following governed records will be retained:</p>
                        <div className="space-y-0.5">
                          {eligibility!.cascadeSummary!.retainedTypes.map((t, i) => (
                            <p key={i} className="text-[10px] text-slate-500">· {t.type} ({t.count})</p>
                          ))}
                        </div>
                      </>
                    )}
                    <p className="text-[10px] font-semibold text-violet-800 mt-2">
                      Total objects to delete: {eligibility!.cascadeSummary!.totalToDelete}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">
                      Deletion reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Explain why this Test Engineering graph is being permanently deleted (min 10 characters)…"
                      disabled={deleting}
                      className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-violet-200 min-h-[60px]"
                    />
                    {reason.length > 0 && reasonMissing && (
                      <p className="text-[10px] text-amber-600 mt-1">Reason must be at least 10 characters.</p>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    This action is <strong>irreversible</strong>. All listed objects will be permanently removed in one governed transaction.
                  </p>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                    <p className="text-xs text-red-700">
                      No governed relationships found. This action is <strong>irreversible</strong>.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600 mb-1 block">
                      Deletion reason <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={reason}
                      onChange={e => setReason(e.target.value)}
                      placeholder="Explain why this Idea is being permanently deleted (min 10 characters)…"
                      disabled={deleting}
                      className="w-full text-xs text-slate-700 border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-red-200 min-h-[60px]"
                    />
                    {reason.length > 0 && reasonMissing && (
                      <p className="text-[10px] text-amber-600 mt-1">Reason must be at least 10 characters.</p>
                    )}
                  </div>
                </>
              )}

              {error && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                  <p className="text-[10px] text-red-700">{error}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={checking || deleting || !!blocked || reasonMissing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {blocked ? 'Deletion Blocked' : cascade ? 'Cascade Delete All' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Promotion Progress Modal ───────────────────────────────────────────────────

export function IdeaPromotionModal({
  idea,
  onClose,
  onComplete,
}: {
  idea: EngineeringIdea | null;
  onClose: () => void;
  onComplete: (result: PromotionResult) => void;
}) {
  const [status, setStatus] = useState<'promoting' | 'success' | 'error'>('promoting');
  const [result, setResult] = useState<PromotionResult | null>(null);

  const run = useCallback(async () => {
    if (!idea) return;
    setStatus('promoting');
    const r = await promoteIdeaToEwo(idea);
    setResult(r);
    setStatus(r.success ? 'success' : 'error');
    onComplete(r);
  }, [idea, onComplete]);

  useEffect(() => {
    if (idea) run();
  }, [idea, run]);

  if (!idea) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={status !== 'promoting' ? onClose : undefined}>
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-6 text-center">
          {status === 'promoting' && (
            <>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Promoting to Engineering Work Order</h3>
              <p className="text-xs text-slate-500 mt-1">Invoking canonical EWO creation service...</p>
            </>
          )}
          {status === 'success' && (
            <>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Promotion Complete</h3>
              <p className="text-xs text-slate-500 mt-1">Engineering Work Order <span className="font-mono font-bold text-violet-600">{result?.ewoRef}</span> created.</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
                Close
              </button>
            </>
          )}
          {status === 'error' && (
            <>
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertCircle className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Promotion Failed</h3>
              <p className="text-xs text-red-600 mt-1 font-mono break-all">{result?.error}</p>
              <button onClick={onClose} className="mt-4 px-4 py-2 text-xs font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors">
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
