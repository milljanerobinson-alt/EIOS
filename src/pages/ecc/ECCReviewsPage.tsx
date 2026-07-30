import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Filter, ClipboardList, ChevronRight, ArrowLeft,
  CheckCircle2, XCircle, Clock, AlertCircle, RotateCcw,
  FileText, Users, History, Scale, Shield, ChevronDown,
  Eye, Trash2,
} from 'lucide-react';
import {
  listEngineeringClassificationReviews,
  getReview,
  listReviewEvidence,
  listReviewParticipants,
  listReviewAuditEvents,
  addReviewEvidence,
  addReviewParticipant,
  recordParticipantPosition,
  transitionReview,
  approveECR,
  rejectECR,
  deferECR,
  deleteReview,
  getSubjectIdentityStatus,
  type GovernedReview,
  type ReviewEvidence,
  type ReviewParticipant,
  type ReviewAuditEvent,
  type ReviewStatus,
  type EvidenceType,
  type ParticipantPosition,
} from '../../lib/reviewService';
import { ECCCreateReviewModal } from './ECCCreateReviewModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ReviewStatus, { label: string; color: string; bg: string; icon: typeof ClipboardList }> = {
  draft:     { label: 'Draft',      color: 'text-slate-500', bg: 'bg-slate-100',  icon: FileText },
  open:      { label: 'Open',       color: 'text-blue-600',  bg: 'bg-blue-50',    icon: Eye },
  in_review: { label: 'In Review',  color: 'text-amber-600', bg: 'bg-amber-50',   icon: RotateCcw },
  approved:  { label: 'Approved',   color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
  rejected:  { label: 'Rejected',   color: 'text-red-600',   bg: 'bg-red-50',     icon: XCircle },
  deferred:  { label: 'Deferred',   color: 'text-purple-600', bg: 'bg-purple-50', icon: Clock },
  closed:    { label: 'Closed',     color: 'text-slate-400', bg: 'bg-slate-50',   icon: Shield },
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  assign_platform:       'Assign to Platform',
  assign_project:        'Assign to Project',
  retain_current_owner:  'Retain Current Owner',
  promote_to_spc:        'Promote to SPC',
  absorb_into_platform:  'Absorb into Platform',
  classify_external:     'Classify as External',
  retire:                'Retire',
  defer:                 'Defer',
  reject_recommendation: 'Reject Recommendation',
};

const OWNERSHIP_LABELS: Record<string, string> = {
  platform: 'Platform',
  project:  'Project',
  spc:      'SPC',
  external: 'External',
};

function confidenceTier(score: number | null): { label: string; color: string } {
  if (score == null) return { label: 'Unknown', color: 'text-slate-400' };
  if (score >= 75) return { label: 'High', color: 'text-emerald-600' };
  if (score >= 50) return { label: 'Medium', color: 'text-amber-600' };
  return { label: 'Low', color: 'text-red-500' };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function SubjectIdentityBadge({ review }: { review: GovernedReview }) {
  const status = getSubjectIdentityStatus(review);
  const cfg: Record<string, { label: string; bg: string; text: string; border: string }> = {
    resolved:  { label: 'Resolved',  bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    missing:   { label: 'Missing',   bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200' },
    invalid:   { label: 'Invalid',   bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200' },
    test_only: { label: 'Test-only', bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200' },
  };
  const c = cfg[status] ?? cfg.missing;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${c.bg} ${c.text} ${c.border} border`}>
      {c.label}
    </span>
  );
}

function StatusBadge({ status }: { status: ReviewStatus }) {
  const { label, color, bg, icon: Icon } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${bg} ${color}`}>
      <Icon className="w-2.5 h-2.5" />
      {label}
    </span>
  );
}

// ─── ECR Queue (list view) ────────────────────────────────────────────────────

interface QueueViewProps {
  onSelectReview: (id: string) => void;
}

function ECRQueue({ onSelectReview }: QueueViewProps) {
  const [reviews, setReviews] = useState<GovernedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [migrationFilter, setMigrationFilter] = useState<'all' | 'yes' | 'no'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listEngineeringClassificationReviews();
      setReviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = reviews.filter(r => {
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!r.title.toLowerCase().includes(q) &&
          !r.review_reference.toLowerCase().includes(q) &&
          !r.subject_reference.toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (confidenceFilter !== 'all') {
      const tier = confidenceTier(r.confidence_score);
      if (tier.label.toLowerCase() !== confidenceFilter) return false;
    }
    if (migrationFilter !== 'all') {
      const migFlag = (r as GovernedReview & { ecr_extension?: { migration_review: boolean } | null }).ecr_extension?.migration_review ?? false;
      if (migrationFilter === 'yes' && !migFlag) return false;
      if (migrationFilter === 'no' && migFlag) return false;
    }
    return true;
  });

  // Metrics
  const counts = {
    draft:     reviews.filter(r => r.status === 'draft').length,
    open:      reviews.filter(r => r.status === 'open').length,
    in_review: reviews.filter(r => r.status === 'in_review').length,
    approved:  reviews.filter(r => r.status === 'approved').length,
    deferred:  reviews.filter(r => r.status === 'deferred').length,
    highConf:  reviews.filter(r => r.confidence_score != null && r.confidence_score >= 75).length,
    awaitingDecision: reviews.filter(r => r.status === 'in_review').length,
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-slate-900 flex items-center justify-center">
                <ClipboardList className="w-3.5 h-3.5 text-slate-300" />
              </div>
              <h1 className="text-base font-bold text-slate-900">Classification Reviews</h1>
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase tracking-wider">Live</span>
            </div>
            <p className="text-[11px] text-slate-500">Engineering Classification Reviews · EOCPS-001 §3</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New ECR
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Draft',              value: counts.draft,           color: 'text-slate-600' },
            { label: 'Open',               value: counts.open,            color: 'text-blue-600' },
            { label: 'In Review',          value: counts.in_review,       color: 'text-amber-600' },
            { label: 'Awaiting Decision',  value: counts.awaitingDecision, color: 'text-amber-600' },
            { label: 'Approved',           value: counts.approved,        color: 'text-emerald-600' },
            { label: 'Deferred',           value: counts.deferred,        color: 'text-purple-600' },
            { label: 'High Confidence',    value: counts.highConf,        color: 'text-emerald-600' },
          ].map(m => (
            <div key={m.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <p className={`text-2xl font-bold ${m.color}`}>{loading ? '–' : m.value}</p>
              <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">{m.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
              placeholder="Search by title, reference, or subject…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="relative">
            <select
              className="pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as ReviewStatus | 'all')}
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              className="pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
              value={confidenceFilter}
              onChange={e => setConfidenceFilter(e.target.value as typeof confidenceFilter)}
            >
              <option value="all">All Confidence</option>
              <option value="high">High (75%+)</option>
              <option value="medium">Medium (50–74%)</option>
              <option value="low">Low (&lt;50%)</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              className="pl-3 pr-7 py-2 text-xs border border-slate-200 rounded-lg bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
              value={migrationFilter}
              onChange={e => setMigrationFilter(e.target.value as typeof migrationFilter)}
            >
              <option value="all">All Reviews</option>
              <option value="yes">Migration Reviews Only</option>
              <option value="no">Non-migration Only</option>
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {(search || statusFilter !== 'all' || confidenceFilter !== 'all' || migrationFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setConfidenceFilter('all'); setMigrationFilter('all'); }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
            >
              <Filter className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Table / empty state */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading classification reviews…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500 mb-1">
              {reviews.length === 0 ? 'No Classification Reviews yet' : 'No reviews match your filters'}
            </p>
            <p className="text-xs text-slate-400 mb-4">
              {reviews.length === 0
                ? 'Create the first Engineering Classification Review to begin governed ownership decisions.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
            {reviews.length === 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create First ECR
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Title</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden md:table-cell">Subject</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Recommendation</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Confidence</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden xl:table-cell">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const tier = confidenceTier(r.confidence_score);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/40'}`}
                      onClick={() => onSelectReview(r.id)}
                    >
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold font-mono text-slate-900">{r.review_reference}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-medium text-slate-800 leading-snug line-clamp-2 max-w-xs">{r.title}</p>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-[11px] text-slate-500">{r.subject_reference || r.subject_object_type}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-[11px] text-slate-600">
                          {r.recommendation ? (RECOMMENDATION_LABELS[r.recommendation] ?? r.recommendation) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {r.confidence_score != null ? (
                          <span className={`text-xs font-bold ${tier.color}`}>{r.confidence_score}%</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <span className="text-[11px] text-slate-400">{formatDate(r.created_at)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <ECCCreateReviewModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); onSelectReview(id); load(); }}
        />
      )}
    </div>
  );
}

// ─── ECR Detail panel ─────────────────────────────────────────────────────────

interface DetailViewProps {
  reviewId: string;
  onBack: () => void;
}

function ECRDetail({ reviewId, onBack }: DetailViewProps) {
  const [review, setReview] = useState<GovernedReview | null>(null);
  const [evidence, setEvidence] = useState<ReviewEvidence[]>([]);
  const [participants, setParticipants] = useState<ReviewParticipant[]>([]);
  const [auditEvents, setAuditEvents] = useState<ReviewAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'evidence' | 'participants' | 'audit'>('overview');

  // Action state
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'defer' | 'add-evidence' | 'add-participant' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Decision inputs
  const [decisionRationale, setDecisionRationale] = useState('');
  const [decidingAuthority, setDecidingAuthority] = useState('');
  const [decisionValue, setDecisionValue] = useState('');
  const [deferUntil, setDeferUntil] = useState('');

  // Evidence inputs
  const [evidenceTitle, setEvidenceTitle] = useState('');
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('manual');
  const [evidenceDesc, setEvidenceDesc] = useState('');

  // Participant inputs
  const [participantRef, setParticipantRef] = useState('');
  const [participantRole, setParticipantRole] = useState<'reviewer' | 'approver' | 'observer' | 'atd' | 'product_owner'>('product_owner');
  const [participantAuthority, setParticipantAuthority] = useState<'deciding' | 'advisory' | 'observing'>('deciding');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [r, ev, part, audit] = await Promise.all([
        getReview(reviewId),
        listReviewEvidence(reviewId),
        listReviewParticipants(reviewId),
        listReviewAuditEvents(reviewId),
      ]);
      setReview(r);
      setEvidence(ev);
      setParticipants(part);
      setAuditEvents(audit);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review');
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => { load(); }, [load]);

  async function handleTransition(to: ReviewStatus) {
    if (!review) return;
    setActionError(null);
    setActionLoading(true);
    try {
      if (to === 'approved') {
        await approveECR(reviewId, {
          decision: decisionValue || 'approve',
          decision_rationale: decisionRationale,
          deciding_authority: decidingAuthority,
        });
      } else if (to === 'rejected') {
        await rejectECR(reviewId, { decision_rationale: decisionRationale });
      } else if (to === 'deferred') {
        await deferECR(reviewId, { decision_rationale: decisionRationale, deferred_until: deferUntil });
      } else {
        await transitionReview(reviewId, to, { actor: 'platform' });
      }
      setActionType(null);
      setDecisionRationale('');
      setDecidingAuthority('');
      setDecisionValue('');
      setDeferUntil('');
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddEvidence() {
    if (!evidenceTitle.trim() || !evidenceDesc.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await addReviewEvidence({
        review_id: reviewId,
        evidence_type: evidenceType,
        title: evidenceTitle.trim(),
        description: evidenceDesc.trim(),
        source_type: 'manual',
        added_by: 'platform',
      });
      setEvidenceTitle('');
      setEvidenceDesc('');
      setActionType(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add evidence');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddParticipant() {
    if (!participantRef.trim()) return;
    setActionLoading(true);
    setActionError(null);
    try {
      await addReviewParticipant({
        review_id: reviewId,
        participant_ref: participantRef.trim(),
        participant_role: participantRole,
        authority_type: participantAuthority,
      });
      setParticipantRef('');
      setActionType(null);
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add participant');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRecordPosition(participantId: string, position: ParticipantPosition) {
    try {
      await recordParticipantPosition(participantId, { position });
      await load();
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Loading review…</p>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-600">{error ?? 'Review not found'}</p>
          <button onClick={onBack} className="mt-4 text-xs text-slate-500 hover:text-slate-700">Go back</button>
        </div>
      </div>
    );
  }

  const ecr = review.ecr_extension as Parameters<typeof review.ecr_extension extends infer T ? (x: T) => T : never>[0];
  const canTransitionTo = {
    open: review.status === 'draft',
    in_review: review.status === 'open',
    approve: review.status === 'in_review',
    reject: review.status === 'in_review',
    defer: ['open', 'in_review'].includes(review.status),
    close: ['approved', 'rejected', 'deferred'].includes(review.status),
  };
  const isClosed = ['closed', 'approved', 'rejected', 'deferred'].includes(review.status);

  const EVIDENCE_TYPE_LABELS: Record<string, string> = {
    usage: 'Usage', duplication: 'Duplication', stability: 'Stability', coupling: 'Coupling',
    business_case: 'Business Case', governance: 'Governance', manual: 'Manual', migration: 'Migration', other: 'Other',
  };

  const AUDIT_EVENT_LABELS: Record<string, string> = {
    created: 'Review Created', updated: 'Review Updated', opened: 'Review Opened',
    evidence_added: 'Evidence Added', participant_added: 'Participant Added', review_started: 'Review Started',
    recommendation_changed: 'Recommendation Changed', approved: 'Review Approved', rejected: 'Review Rejected',
    deferred: 'Review Deferred', closed: 'Review Closed', reopened: 'Review Reopened',
  };

  return (
    <div className="flex-1 overflow-auto bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            All Reviews
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-mono font-bold text-slate-700">{review.review_reference}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <StatusBadge status={review.status} />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">EOCPS-001 §3</span>
            </div>
            <h1 className="text-lg font-bold text-slate-900 leading-snug">{review.title}</h1>
            {review.summary && <p className="text-sm text-slate-500 mt-1">{review.summary}</p>}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {canTransitionTo.open && (
              <button onClick={() => handleTransition('open')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
                <Eye className="w-3.5 h-3.5" />
                Open Review
              </button>
            )}
            {canTransitionTo.in_review && (
              <button onClick={() => handleTransition('in_review')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
                Start Review
              </button>
            )}
            {canTransitionTo.approve && (
              <button onClick={() => setActionType('approve')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Approve
              </button>
            )}
            {canTransitionTo.reject && (
              <button onClick={() => setActionType('reject')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors">
                <XCircle className="w-3.5 h-3.5" />
                Reject
              </button>
            )}
            {canTransitionTo.defer && (
              <button onClick={() => setActionType('defer')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition-colors">
                <Clock className="w-3.5 h-3.5" />
                Defer
              </button>
            )}
            {canTransitionTo.close && (
              <button onClick={() => handleTransition('closed')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors">
                <Shield className="w-3.5 h-3.5" />
                Close
              </button>
            )}
            {/* Delete — only for draft or test/validation records */}
            {(review.status === 'draft' || (review.record_purpose ?? 'production') !== 'production') && (
              <button
                onClick={() => {
                  if (confirm(
                    `Delete this ${(review.record_purpose ?? 'production')} ECR?\n\n` +
                    `Reference: ${review.review_reference}\n` +
                    `Title: ${review.title}\n\n` +
                    (review.record_purpose ?? 'production') === 'production'
                      ? 'Only draft production reviews can be deleted. This action cannot be undone.'
                      : 'Test/validation records can be permanently deleted. References are never reused. This action cannot be undone.'
                  )) {
                    deleteReview(review.id).then(() => onBack()).catch(e => alert(e.message));
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors border border-red-200"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Migration notice */}
      <div className="mx-6 mt-4 bg-slate-900 rounded-xl px-5 py-3 flex items-center gap-3">
        <Scale className="w-4 h-4 text-slate-400 shrink-0" />
        <p className="text-xs text-slate-400">
          <strong className="text-slate-200">Ownership changes are applied during the governed migration or capability promotion stage.</strong>
          {' '}Approval of this ECR records the governance decision only. Actual ownership attribution and lineage events occur in EWO-014.3+.
        </p>
      </div>

      {/* Action form panels */}
      {actionType && (
        <div className="mx-6 mt-4 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              {actionType === 'approve' ? 'Approve ECR' :
               actionType === 'reject' ? 'Reject ECR' :
               actionType === 'defer' ? 'Defer ECR' :
               actionType === 'add-evidence' ? 'Add Evidence' : 'Add Participant'}
            </h3>
            <button onClick={() => { setActionType(null); setActionError(null); }}
              className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </div>

          {(actionType === 'approve' || actionType === 'reject' || actionType === 'defer') && (
            <>
              {actionType === 'approve' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Decision <span className="text-red-500">*</span></label>
                  <input
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                    placeholder="e.g. approve, assign_platform"
                    value={decisionValue}
                    onChange={e => setDecisionValue(e.target.value)}
                  />
                </div>
              )}
              {actionType === 'approve' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Deciding Authority <span className="text-red-500">*</span></label>
                  <input
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                    placeholder="Name or role of the human authority making this decision"
                    value={decidingAuthority}
                    onChange={e => setDecidingAuthority(e.target.value)}
                  />
                  <p className="text-[10px] text-slate-400 mt-1">ATD may recommend, but the final authority must be a human decision-maker.</p>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  {actionType === 'defer' ? 'Rationale' : 'Decision Rationale'} <span className="text-red-500">*</span>
                </label>
                <textarea rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all resize-none"
                  placeholder="Provide a clear rationale for this decision"
                  value={decisionRationale}
                  onChange={e => setDecisionRationale(e.target.value)}
                />
              </div>
              {actionType === 'defer' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Future Review Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                    value={deferUntil}
                    onChange={e => setDeferUntil(e.target.value)}
                  />
                </div>
              )}
              {actionType === 'approve' && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    By approving this ECR I confirm I have reviewed the evidence package and participant positions.
                    No ownership changes will occur at this stage.
                  </p>
                </div>
              )}
              {actionError && <p className="text-xs text-red-600">{actionError}</p>}
              <button
                onClick={() => handleTransition(actionType === 'approve' ? 'approved' : actionType === 'reject' ? 'rejected' : 'deferred')}
                disabled={actionLoading ||
                  !decisionRationale.trim() ||
                  (actionType === 'approve' && (!decidingAuthority.trim())) ||
                  (actionType === 'defer' && !deferUntil)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' :
                  actionType === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-700 hover:bg-slate-800'
                }`}
              >
                {actionLoading ? 'Saving…' :
                  actionType === 'approve' ? 'Confirm Approval' :
                  actionType === 'reject' ? 'Confirm Rejection' : 'Confirm Deferral'}
              </button>
            </>
          )}

          {actionType === 'add-evidence' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Evidence Title <span className="text-red-500">*</span></label>
                <input
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                  value={evidenceTitle} onChange={e => setEvidenceTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Evidence Type</label>
                <div className="relative">
                  <select
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                    value={evidenceType} onChange={e => setEvidenceType(e.target.value as EvidenceType)}
                  >
                    {Object.entries(EVIDENCE_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Description <span className="text-red-500">*</span></label>
                <textarea rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all resize-none"
                  value={evidenceDesc} onChange={e => setEvidenceDesc(e.target.value)}
                />
              </div>
              {actionError && <p className="text-xs text-red-600">{actionError}</p>}
              <button
                onClick={handleAddEvidence}
                disabled={actionLoading || !evidenceTitle.trim() || !evidenceDesc.trim()}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Adding…' : 'Add Evidence'}
              </button>
            </>
          )}

          {actionType === 'add-participant' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Participant Reference <span className="text-red-500">*</span></label>
                <input
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all"
                  placeholder="Name, role, or identifier"
                  value={participantRef} onChange={e => setParticipantRef(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Role</label>
                  <div className="relative">
                    <select
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                      value={participantRole}
                      onChange={e => setParticipantRole(e.target.value as typeof participantRole)}
                    >
                      {['reviewer', 'approver', 'observer', 'atd', 'product_owner'].map(r => (
                        <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Authority Type</label>
                  <div className="relative">
                    <select
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg appearance-none bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all pr-8"
                      value={participantAuthority}
                      onChange={e => setParticipantAuthority(e.target.value as typeof participantAuthority)}
                    >
                      {['deciding', 'advisory', 'observing'].map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
              {actionError && <p className="text-xs text-red-600">{actionError}</p>}
              <button
                onClick={handleAddParticipant}
                disabled={actionLoading || !participantRef.trim()}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLoading ? 'Adding…' : 'Add Participant'}
              </button>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="mx-6 mt-4 bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex border-b border-slate-100">
          {(['overview', 'evidence', 'participants', 'audit'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold transition-colors border-b-2 ${
                activeTab === tab
                  ? 'text-slate-900 border-slate-900'
                  : 'text-slate-400 border-transparent hover:text-slate-600'
              }`}
            >
              {tab === 'overview' && <Scale className="w-3.5 h-3.5" />}
              {tab === 'evidence' && <FileText className="w-3.5 h-3.5" />}
              {tab === 'participants' && <Users className="w-3.5 h-3.5" />}
              {tab === 'audit' && <History className="w-3.5 h-3.5" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {tab === 'evidence' && evidence.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">{evidence.length}</span>
              )}
              {tab === 'participants' && participants.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-bold">{participants.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Overview tab */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Core fields */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Reference',        value: review.review_reference },
                  { label: 'Subject Type',     value: review.subject_object_type?.replace(/_/g, ' ') },
                  { label: 'Subject Ref',      value: review.subject_reference || '—' },
                  { label: 'Priority',         value: review.priority },
                  { label: 'Trigger',          value: review.trigger_type?.replace(/_/g, ' ') },
                  { label: 'Created',          value: formatDateTime(review.created_at) },
                  { label: 'Opened',           value: review.opened_at ? formatDateTime(review.opened_at) : '—' },
                  { label: 'Decided',          value: review.decided_at ? formatDateTime(review.decided_at) : '—' },
                  { label: 'Created By',       value: review.created_by },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-xs text-slate-800 font-medium">{value}</p>
                  </div>
                ))}
                {/* Subject Identity Status */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Subject Identity</p>
                  <SubjectIdentityBadge review={review} />
                </div>
                {/* Record Purpose */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Record Purpose</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    (review.record_purpose ?? 'production') === 'production' ? 'bg-slate-50 text-slate-600 border-slate-200' :
                    (review.record_purpose ?? 'production') === 'validation' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {(review.record_purpose ?? 'production').toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Recommendation */}
              {review.recommendation && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">ATD Recommendation</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {RECOMMENDATION_LABELS[review.recommendation] ?? review.recommendation}
                  </p>
                  {review.summary && <p className="text-xs text-slate-500 mt-1">{review.summary}</p>}
                </div>
              )}

              {/* Scores */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Confidence Score',        value: review.confidence_score, suffix: '%' },
                  { label: 'Classification Confidence', value: (ecr as { classification_confidence?: number | null } | null)?.classification_confidence, suffix: '%' },
                  { label: 'Reusability Score',       value: (ecr as { reusability_score?: number | null } | null)?.reusability_score, suffix: '%' },
                  { label: 'Promotion Eligible',      value: (ecr as { promotion_eligible?: boolean } | null)?.promotion_eligible ? 'Yes' : 'No', suffix: '' },
                ].map(({ label, value, suffix }) => (
                  <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider mb-1">{label}</p>
                    <p className={`text-xl font-bold ${value != null ? 'text-slate-900' : 'text-slate-200'}`}>
                      {value != null ? `${value}${suffix}` : '—'}
                    </p>
                  </div>
                ))}
              </div>

              {/* ECR ownership fields */}
              {ecr && (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Current Ownership',      value: OWNERSHIP_LABELS[(ecr as { current_ownership_type_key?: string | null }).current_ownership_type_key ?? ''] ?? '—' },
                    { label: 'Proposed Ownership',     value: OWNERSHIP_LABELS[(ecr as { proposed_ownership_type_key?: string | null }).proposed_ownership_type_key ?? ''] ?? '—' },
                    { label: 'Engineering Classification', value: (ecr as { object_classification_key?: string | null }).object_classification_key?.replace(/_/g, ' ') ?? '—' },
                    { label: 'Effective Date',         value: (ecr as { effective_date?: string | null }).effective_date ?? '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{label}</p>
                      <p className="text-xs text-slate-800 font-medium capitalize">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ECR flags */}
              {ecr && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Review Flags</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: 'migration_review', label: 'Migration Review' },
                      { key: 'promotion_review', label: 'Promotion Review' },
                      { key: 'retirement_review', label: 'Retirement Review' },
                      { key: 'constitutional_boundary_case', label: 'Constitutional Boundary' },
                    ].map(({ key, label }) => {
                      const active = (ecr as Record<string, unknown>)[key] === true;
                      return (
                        <span key={key} className={`text-[10px] font-bold px-2 py-1 rounded-lg border uppercase tracking-wider ${
                          active ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-200 text-slate-300'
                        }`}>{label}</span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Decision */}
              {review.decision_rationale && (
                <div className={`rounded-xl p-4 border ${review.status === 'approved' ? 'bg-emerald-50 border-emerald-200' : review.status === 'rejected' ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2 text-slate-500">Decision Record</p>
                  {review.deciding_authority && (
                    <p className="text-xs font-semibold text-slate-800 mb-1">Deciding Authority: {review.deciding_authority}</p>
                  )}
                  {review.decision && (
                    <p className="text-xs font-semibold text-slate-700 mb-1">Decision: {review.decision}</p>
                  )}
                  <p className="text-sm text-slate-700">{review.decision_rationale}</p>
                  {review.deferred_until && (
                    <p className="text-xs text-slate-500 mt-1">Deferred until: {formatDate(review.deferred_until)}</p>
                  )}
                </div>
              )}

              {/* Closed notice */}
              {isClosed && review.status !== 'approved' && review.status !== 'rejected' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <Shield className="w-4 h-4 text-slate-400 shrink-0" />
                  <p className="text-xs text-slate-500">This review is read-only. Evidence and audit events can still be appended.</p>
                </div>
              )}
            </div>
          )}

          {/* Evidence tab */}
          {activeTab === 'evidence' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">{evidence.length} Evidence Record{evidence.length !== 1 ? 's' : ''}</p>
                <button
                  onClick={() => setActionType('add-evidence')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Evidence
                </button>
              </div>
              {evidence.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">No evidence records yet</p>
                </div>
              ) : (
                evidence.map((ev) => (
                  <div key={ev.id} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase tracking-wider">
                          {EVIDENCE_TYPE_LABELS[ev.evidence_type] ?? ev.evidence_type}
                        </span>
                        <p className="text-xs font-semibold text-slate-800">{ev.title}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{formatDateTime(ev.created_at)}</span>
                    </div>
                    {ev.description && <p className="text-xs text-slate-600 leading-relaxed">{ev.description}</p>}
                    <p className="text-[10px] text-slate-400 mt-1.5">Added by: {ev.added_by}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Participants tab */}
          {activeTab === 'participants' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">{participants.length} Participant{participants.length !== 1 ? 's' : ''}</p>
                <button
                  onClick={() => setActionType('add-participant')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Participant
                </button>
              </div>
              {participants.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <Users className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">No participants yet</p>
                </div>
              ) : (
                participants.map((p) => (
                  <div key={p.id} className="border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-slate-800">{p.participant_ref}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wider">
                            {p.participant_role.replace(/_/g, ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400">{p.authority_type}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {(['support', 'oppose', 'neutral', 'abstain'] as ParticipantPosition[]).map(pos => (
                          <button
                            key={pos}
                            onClick={() => handleRecordPosition(p.id, pos)}
                            className={`px-2 py-1 text-[9px] font-bold rounded uppercase tracking-wider transition-colors ${
                              p.position === pos
                                ? pos === 'support' ? 'bg-emerald-500 text-white'
                                  : pos === 'oppose' ? 'bg-red-500 text-white'
                                  : pos === 'neutral' ? 'bg-slate-500 text-white'
                                  : 'bg-slate-400 text-white'
                                : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                            }`}
                          >{pos}</button>
                        ))}
                      </div>
                    </div>
                    {p.comments && <p className="text-xs text-slate-500 mt-2">{p.comments}</p>}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Audit timeline */}
          {activeTab === 'audit' && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-700 mb-3">{auditEvents.length} Audit Event{auditEvents.length !== 1 ? 's' : ''} — append-only</p>
              {auditEvents.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <History className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">No audit events yet</p>
                </div>
              ) : (
                <div className="relative pl-6">
                  <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
                  {auditEvents.map((ev, i) => (
                    <div key={ev.id} className="relative mb-4 last:mb-0">
                      <div className="absolute -left-5 top-0.5 w-3 h-3 rounded-full bg-white border-2 border-slate-300" />
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="text-xs font-semibold text-slate-800">
                            {AUDIT_EVENT_LABELS[ev.event_type] ?? ev.event_type}
                          </p>
                          <span className="text-[10px] text-slate-400">{formatDateTime(ev.created_at)}</span>
                        </div>
                        <p className="text-[11px] text-slate-500">by {ev.actor}</p>
                        {ev.reason && <p className="text-[11px] text-slate-500 mt-0.5">{ev.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="h-8" />
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function ECCReviewsPage() {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  if (selectedReviewId) {
    return (
      <ECRDetail
        reviewId={selectedReviewId}
        onBack={() => setSelectedReviewId(null)}
      />
    );
  }

  return <ECRQueue onSelectReview={setSelectedReviewId} />;
}
