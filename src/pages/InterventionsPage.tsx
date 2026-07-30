import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  ShieldAlert, Plus, Search, Filter, Loader2, X, FileText,
  Paperclip, Lightbulb, CalendarClock, MessageSquare,
  CheckCircle2, Circle, Clock, Calendar, User, AlertTriangle,
  FileDown, Trash2, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  InterventionCase, InterventionNote, InterventionEvidence,
  InterventionSupportStrategy, InterventionReassessment,
  AssessmentInvitation, Qualification, InterventionStatus,
} from '../lib/types';
import { useAuth } from '../lib/auth';
import { logAudit, enqueueAxcelerateWriteback } from '../lib/audit';

type CaseWithJoins = InterventionCase & {
  invitation: Pick<AssessmentInvitation, 'id' | 'candidate_name' | 'candidate_email'> | null;
  qualification: Pick<Qualification, 'id' | 'code' | 'name'> | null;
};

type TabKey = 'notes' | 'evidence' | 'strategies' | 'reassessment';

const STATUS_BADGE: Record<InterventionStatus, string> = {
  open: 'bg-rose-100 text-rose-700',
  scheduled_reassessment: 'bg-amber-100 text-amber-700',
  closed: 'bg-slate-200 text-slate-700',
};

const STATUS_LABEL: Record<InterventionStatus, string> = {
  open: 'Open',
  scheduled_reassessment: 'Scheduled Reassessment',
  closed: 'Closed',
};

const REASSESSMENT_BADGE: Record<InterventionReassessment['status'], string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
  no_show: 'bg-rose-100 text-rose-700',
};

const STRATEGY_BADGE: Record<InterventionSupportStrategy['status'], string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-emerald-100 text-emerald-700',
};

const TABS: { key: TabKey; label: string; icon: typeof FileText }[] = [
  { key: 'notes', label: 'Notes', icon: MessageSquare },
  { key: 'evidence', label: 'Evidence', icon: Paperclip },
  { key: 'strategies', label: 'Strategies', icon: Lightbulb },
  { key: 'reassessment', label: 'Reassessment', icon: CalendarClock },
];

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function InterventionsPage() {
  const { profile } = useAuth();
  const [cases, setCases] = useState<CaseWithJoins[]>([]);
  const [invitations, setInvitations] = useState<AssessmentInvitation[]>([]);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<InterventionStatus | 'all'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseWithJoins | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('intervention_cases')
      .select(`
        *,
        invitation:assessment_invitations(id, candidate_name, candidate_email),
        qualification:qualifications(id, code, name)
      `)
      .order('opened_at', { ascending: false });
    if (err) {
      setError(err.message);
    } else {
      setCases((data || []) as CaseWithJoins[]);
    }
  }, []);

  async function loadFormData() {
    const [invRes, qualRes] = await Promise.all([
      supabase
        .from('assessment_invitations')
        .select('id, candidate_name, candidate_email, qualification_id')
        .order('created_at', { ascending: false }),
      supabase.from('qualifications').select('*').eq('active', true).order('name'),
    ]);
    if (invRes.data) setInvitations(invRes.data as AssessmentInvitation[]);
    if (qualRes.data) setQualifications(qualRes.data as Qualification[]);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadCases(), loadFormData()]);
      setLoading(false);
    })();
  }, [loadCases]);

  const filteredCases = useMemo(() => {
    return cases.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const name = c.invitation?.candidate_name?.toLowerCase() || '';
        const email = c.invitation?.candidate_email?.toLowerCase() || '';
        const reason = c.trigger_reason?.toLowerCase() || '';
        if (!name.includes(q) && !email.includes(q) && !reason.includes(q)) return false;
      }
      return true;
    });
  }, [cases, statusFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: cases.length };
    for (const c of cases) counts[c.status] = (counts[c.status] || 0) + 1;
    return counts;
  }, [cases]);

  async function handleCreateCase(form: {
    invitationId: string;
    qualificationId: string;
    triggerReason: string;
  }) {
    const { data: { user } } = await supabase.auth.getUser();
    const now = new Date().toISOString();
    const { data, error: err } = await supabase
      .from('intervention_cases')
      .insert({
        invitation_id: form.invitationId,
        qualification_id: form.qualificationId || null,
        status: 'open',
        trigger_reason: form.triggerReason.trim() || null,
        opened_at: now,
        opened_by: user?.id || null,
      })
      .select()
      .single();
    if (err) throw err;
    logAudit({
      event_type: 'intervention.created',
      category: 'intervention_management',
      description: `Intervention case opened — trigger: ${form.triggerReason.trim() || 'unspecified'}`,
      source: 'admin',
      actor_id: user?.id ?? null,
      invitation_id: form.invitationId,
      qualification_id: form.qualificationId || null,
      new_values: { status: 'open', trigger_reason: form.triggerReason.trim() || null },
    });
    enqueueAxcelerateWriteback(form.invitationId, 'intervention_required', {
      trigger_reason: form.triggerReason.trim() || null,
    });
    await loadCases();
    return data as InterventionCase;
  }

  async function handleCloseCase(caseId: string, summary: string) {
    const now = new Date().toISOString();
    const { data: { user } } = await supabase.auth.getUser();
    const caseRecord = cases.find((c) => c.id === caseId);
    const { error: err } = await supabase
      .from('intervention_cases')
      .update({ status: 'closed', closed_at: now, closing_summary: summary.trim() || null })
      .eq('id', caseId);
    if (err) throw err;
    logAudit({
      event_type: 'intervention.closed',
      category: 'intervention_management',
      description: `Intervention case closed — ${caseRecord?.invitation?.candidate_name ?? caseId}`,
      source: 'admin',
      actor_id: user?.id ?? null,
      invitation_id: caseRecord?.invitation_id ?? null,
      qualification_id: caseRecord?.qualification_id ?? null,
      previous_values: { status: caseRecord?.status },
      new_values: { status: 'closed', closing_summary: summary.trim() || null },
    });
    await loadCases();
  }

  async function handleScheduleReassessment(caseId: string, date: string) {
    const { data: { user } } = await supabase.auth.getUser();
    const caseRecord = cases.find((c) => c.id === caseId);
    const { error: err } = await supabase
      .from('intervention_reassessments')
      .insert({
        intervention_case_id: caseId,
        scheduled_date: date,
        status: 'scheduled',
        new_invitation_id: null,
      });
    if (err) throw err;
    await supabase
      .from('intervention_cases')
      .update({ status: 'scheduled_reassessment' })
      .eq('id', caseId);
    logAudit({
      event_type: 'reassessment.scheduled',
      category: 'intervention_management',
      description: `Reassessment scheduled for ${caseRecord?.invitation?.candidate_name ?? caseId} on ${date}`,
      source: 'admin',
      actor_id: user?.id ?? null,
      invitation_id: caseRecord?.invitation_id ?? null,
      qualification_id: caseRecord?.qualification_id ?? null,
      new_values: { scheduled_date: date, status: 'scheduled' },
    });
    await loadCases();
  }

  async function handleUpdateReassessmentStatus(
    r: InterventionReassessment, newStatus: InterventionReassessment['status'],
  ) {
    const { error: err } = await supabase
      .from('intervention_reassessments')
      .update({ status: newStatus })
      .eq('id', r.id);
    if (err) throw err;
  }

  const statusFilterOptions: { value: InterventionStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'open', label: 'Open' },
    { value: 'scheduled_reassessment', label: 'Scheduled' },
    { value: 'closed', label: 'Closed' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Interventions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage intervention cases, support strategies, evidence, and reassessments for at-risk candidates.
          </p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          New Case
        </button>
      </div>

      {error && (
        <div className="card p-4 border-rose-200 bg-rose-50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-rose-700">{error}</p>
              <button onClick={() => setError(null)} className="text-rose-600 hover:text-rose-800 text-xs font-medium mt-1">
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by candidate, email, or trigger reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-9"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as InterventionStatus | 'all')}
              className="input pl-9 pr-8 appearance-none cursor-pointer min-w-[160px]"
            >
              {statusFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({statusCounts[opt.value] || 0})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Loading intervention cases...
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="card p-12 text-center">
          <ShieldAlert className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-base font-semibold text-slate-900 mb-1">
            {cases.length === 0 ? 'No intervention cases' : 'No matching cases'}
          </h3>
          <p className="text-sm text-slate-500 mb-4">
            {cases.length === 0
              ? 'Create an intervention case to track support for an at-risk candidate.'
              : 'Try adjusting your search or filter criteria.'}
          </p>
          {cases.length === 0 && (
            <button onClick={() => setShowCreateModal(true)} className="btn-primary">
              <Plus className="w-4 h-4" />
              New Case
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="table-header">Candidate</th>
                    <th className="table-header">Qualification</th>
                    <th className="table-header">Trigger Reason</th>
                    <th className="table-header">Status</th>
                    <th className="table-header">Opened</th>
                    <th className="table-header text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredCases.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedCase(c)}
                      className="hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <td className="table-cell">
                        <div className="font-medium text-slate-900">
                          {c.invitation?.candidate_name || 'Unknown candidate'}
                        </div>
                        <div className="text-xs text-slate-500">
                          {c.invitation?.candidate_email || '—'}
                        </div>
                      </td>
                      <td className="table-cell">
                        {c.qualification ? (
                          <div>
                            <div className="text-sm font-medium text-slate-700">{c.qualification.code}</div>
                            <div className="text-xs text-slate-500">{c.qualification.name}</div>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                      </td>
                      <td className="table-cell max-w-[240px]">
                        <span className="text-sm text-slate-600 truncate block">
                          {c.trigger_reason || '—'}
                        </span>
                      </td>
                      <td className="table-cell">
                        <span className={`badge ${STATUS_BADGE[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-slate-600">{formatDate(c.opened_at)}</span>
                        </div>
                      </td>
                      <td className="table-cell text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedCase(c); }}
                          className="btn-ghost text-xs px-2 py-1"
                        >
                          View
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="md:hidden space-y-3">
            {filteredCases.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c)}
                className="card p-4 w-full text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-medium text-slate-900">
                      {c.invitation?.candidate_name || 'Unknown candidate'}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.invitation?.candidate_email || '—'}
                    </div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[c.status]}`}>
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                {c.qualification && (
                  <div className="text-xs text-slate-500 mb-2">
                    {c.qualification.code} — {c.qualification.name}
                  </div>
                )}
                {c.trigger_reason && (
                  <div className="text-xs text-slate-600 mb-2 line-clamp-2">{c.trigger_reason}</div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                  Opened {formatDate(c.opened_at)}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {showCreateModal && (
        <CreateCaseModal
          invitations={invitations}
          qualifications={qualifications}
          onClose={() => setShowCreateModal(false)}
          onCreate={async (form) => {
            try {
              await handleCreateCase(form);
              setShowCreateModal(false);
            } catch (err: any) {
              setError(err.message || 'Failed to create case.');
            }
          }}
        />
      )}

      {selectedCase && (
        <CaseDetailModal
          caseData={selectedCase}
          profileName={profile?.full_name || 'You'}
          onClose={() => setSelectedCase(null)}
          onCaseUpdated={async (updated) => {
            await loadCases();
            if (updated) setSelectedCase(updated);
          }}
          onCloseCase={handleCloseCase}
          onScheduleReassessment={handleScheduleReassessment}
          onUpdateReassessmentStatus={handleUpdateReassessmentStatus}
        />
      )}
    </div>
  );
}

function CreateCaseModal({
  invitations, qualifications, onClose, onCreate,
}: {
  invitations: AssessmentInvitation[];
  qualifications: Qualification[];
  onClose: () => void;
  onCreate: (form: { invitationId: string; qualificationId: string; triggerReason: string }) => Promise<void>;
}) {
  const [invitationId, setInvitationId] = useState('');
  const [qualificationId, setQualificationId] = useState('');
  const [triggerReason, setTriggerReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invitationId) {
      setError('Please select a candidate invitation.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ invitationId, qualificationId, triggerReason });
    } catch (err: any) {
      setError(err.message || 'Failed to create case.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between p-5 border-b border-slate-200 sticky top-0 bg-white rounded-t-xl">
          <div>
            <h2 className="text-lg font-bold text-slate-900">New Intervention Case</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Open a case to track support for an at-risk candidate.
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" disabled={submitting}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="label" htmlFor="invitation">Candidate Invitation</label>
            <select
              id="invitation"
              value={invitationId}
              onChange={(e) => {
                setInvitationId(e.target.value);
                const inv = invitations.find((i) => i.id === e.target.value);
                if (inv?.qualification_id) setQualificationId(inv.qualification_id);
              }}
              className="input cursor-pointer"
              disabled={submitting}
            >
              <option value="">Select a candidate...</option>
              {invitations.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.candidate_name} ({inv.candidate_email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="qualification">Qualification</label>
            <select
              id="qualification"
              value={qualificationId}
              onChange={(e) => setQualificationId(e.target.value)}
              className="input cursor-pointer"
              disabled={submitting}
            >
              <option value="">Select a qualification...</option>
              {qualifications.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.code} — {q.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="trigger-reason">Trigger Reason</label>
            <textarea
              id="trigger-reason"
              value={triggerReason}
              onChange={(e) => setTriggerReason(e.target.value)}
              className="input min-h-[100px] resize-y"
              placeholder="e.g. Candidate scored below ACSF Level 3 in Numeracy on initial LLN assessment..."
              disabled={submitting}
            />
          </div>

          {error && (
            <div className="card p-3 border-rose-200 bg-rose-50">
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={submitting || !invitationId}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4" />
                  Open Case
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CaseDetailModal({
  caseData, profileName, onClose, onCaseUpdated, onCloseCase,
  onScheduleReassessment, onUpdateReassessmentStatus,
}: {
  caseData: CaseWithJoins;
  profileName: string;
  onClose: () => void;
  onCaseUpdated: (updated: CaseWithJoins | null) => Promise<void>;
  onCloseCase: (caseId: string, summary: string) => Promise<void>;
  onScheduleReassessment: (caseId: string, date: string) => Promise<void>;
  onUpdateReassessmentStatus: (r: InterventionReassessment, newStatus: InterventionReassessment['status']) => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('notes');
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closingSummary, setClosingSummary] = useState('');
  const [closing, setClosing] = useState(false);
  const [tabError, setTabError] = useState<string | null>(null);

  async function doClose() {
    setClosing(true);
    setTabError(null);
    try {
      await onCloseCase(caseData.id, closingSummary);
      setShowCloseForm(false);
      await onCaseUpdated(null);
    } catch (err: any) {
      setTabError(err.message || 'Failed to close case.');
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="card w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between p-5 border-b border-slate-200">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {caseData.invitation?.candidate_name || 'Unknown candidate'}
              </h2>
              <span className={`badge ${STATUS_BADGE[caseData.status]}`}>
                {STATUS_LABEL[caseData.status]}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5 truncate">
              {caseData.invitation?.candidate_email || '—'}
              {caseData.qualification && ` · ${caseData.qualification.code} — ${caseData.qualification.name}`}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Trigger Reason</div>
            <div className="text-sm text-slate-700">{caseData.trigger_reason || '—'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Opened</div>
            <div className="text-sm text-slate-700 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              {formatDate(caseData.opened_at)}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Opened By</div>
            <div className="text-sm text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              {caseData.opened_by ? profileName : 'System'}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Closed</div>
            <div className="text-sm text-slate-700 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {formatDate(caseData.closed_at)}
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-200 overflow-x-auto scrollbar-thin">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setTabError(null); }}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-5">
          {tabError && (
            <div className="card p-3 border-rose-200 bg-rose-50 mb-4">
              <p className="text-sm text-rose-700">{tabError}</p>
            </div>
          )}
          {activeTab === 'notes' && (
            <NotesTab caseId={caseData.id} />
          )}
          {activeTab === 'evidence' && (
            <EvidenceTab caseId={caseData.id} />
          )}
          {activeTab === 'strategies' && (
            <StrategiesTab caseId={caseData.id} />
          )}
          {activeTab === 'reassessment' && (
            <ReassessmentTab
              caseId={caseData.id}
              caseStatus={caseData.status}
              onSchedule={onScheduleReassessment}
              onUpdateStatus={onUpdateReassessmentStatus}
              onCaseUpdated={onCaseUpdated}
            />
          )}
        </div>

        <div className="p-5 border-t border-slate-200 bg-slate-50">
          {caseData.status === 'closed' ? (
            <div className="text-sm text-slate-600">
              <span className="font-medium">Closing summary: </span>
              {caseData.closing_summary || 'No summary provided.'}
            </div>
          ) : showCloseForm ? (
            <div className="space-y-3">
              <label className="label" htmlFor="closing-summary">Closing Summary</label>
              <textarea
                id="closing-summary"
                value={closingSummary}
                onChange={(e) => setClosingSummary(e.target.value)}
                className="input min-h-[80px] resize-y"
                placeholder="Summarise the outcome and rationale for closing this case..."
                disabled={closing}
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => { setShowCloseForm(false); setClosingSummary(''); }}
                  className="btn-secondary"
                  disabled={closing}
                >
                  Cancel
                </button>
                <button onClick={doClose} className="btn-danger" disabled={closing}>
                  {closing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Closing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Confirm Close
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Close this case once the candidate has been reassessed or support is no longer needed.
              </p>
              <button onClick={() => setShowCloseForm(true)} className="btn-secondary">
                <ShieldAlert className="w-4 h-4" />
                Close Case
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NotesTab({ caseId }: { caseId: string }) {
  const [notes, setNotes] = useState<InterventionNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('intervention_notes')
      .select('*')
      .eq('intervention_case_id', caseId)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setNotes((data || []) as InterventionNote[]);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('intervention_notes')
        .insert({
          intervention_case_id: caseId,
          author_id: user?.id || null,
          note_text: noteText.trim(),
        });
      if (err) throw err;
      setNoteText('');
      await loadNotes();
    } catch (err: any) {
      setError(err.message || 'Failed to add note.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addNote} className="space-y-3">
        <label className="label" htmlFor="note-text">Add a Note</label>
        <textarea
          id="note-text"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="input min-h-[80px] resize-y"
          placeholder="Record observations, actions, or communications..."
          disabled={submitting}
        />
        <div className="flex items-center justify-end">
          <button type="submit" className="btn-primary" disabled={submitting || !noteText.trim()}>
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MessageSquare className="w-4 h-4" />
            )}
            Add Note
          </button>
        </div>
      </form>

      {error && (
        <div className="card p-3 border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading notes...
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <MessageSquare className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No notes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <User className="w-3.5 h-3.5" />
                  <span>{note.author_id ? 'Staff member' : 'System'}</span>
                  <span>·</span>
                  <span>{formatDateTime(note.created_at)}</span>
                </div>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.note_text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EvidenceTab({ caseId }: { caseId: string }) {
  const [evidence, setEvidence] = useState<InterventionEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadEvidence = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('intervention_evidence')
      .select('*')
      .eq('intervention_case_id', caseId)
      .order('uploaded_at', { ascending: false });
    if (err) setError(err.message);
    else setEvidence((data || []) as InterventionEvidence[]);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { loadEvidence(); }, [loadEvidence]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const filePath = `${caseId}/${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from('intervention-evidence')
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage
        .from('intervention-evidence')
        .getPublicUrl(filePath);
      const { error: dbErr } = await supabase
        .from('intervention_evidence')
        .insert({
          intervention_case_id: caseId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type || null,
          uploaded_by: user?.id || null,
          description: description.trim() || null,
        });
      if (dbErr) throw dbErr;
      setDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadEvidence();
    } catch (err: any) {
      setError(err.message || 'Failed to upload file.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(ev: InterventionEvidence) {
    const filePath = `${caseId}/${ev.file_name}`;
    await supabase.storage.from('intervention-evidence').remove([filePath]);
    const { error: err } = await supabase
      .from('intervention_evidence')
      .delete()
      .eq('id', ev.id);
    if (err) {
      setError(err.message);
      return;
    }
    await loadEvidence();
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 border-dashed border-slate-300">
        <label className="label">Upload Evidence File</label>
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleUpload}
          disabled={uploading}
          className="input pt-2 pb-2 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
        />
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="input mt-3"
          placeholder="Optional description..."
          disabled={uploading}
        />
        {uploading && (
          <div className="flex items-center gap-2 mt-3 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </div>
        )}
      </div>

      {error && (
        <div className="card p-3 border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading evidence...
        </div>
      ) : evidence.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Paperclip className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No evidence files uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {evidence.map((ev) => (
            <div key={ev.id} className="card p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-primary-600" />
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={ev.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-slate-900 hover:text-primary-700 truncate block"
                >
                  {ev.file_name}
                </a>
                {ev.description && (
                  <p className="text-xs text-slate-500 mt-0.5">{ev.description}</p>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>{formatDateTime(ev.uploaded_at)}</span>
                  {ev.file_type && (
                    <>
                      <span>·</span>
                      <span className="truncate">{ev.file_type}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={ev.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost p-1.5"
                  title="Download"
                >
                  <FileDown className="w-4 h-4" />
                </a>
                <button
                  onClick={() => handleDelete(ev)}
                  className="btn-ghost p-1.5 text-rose-500 hover:text-rose-700"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StrategiesTab({ caseId }: { caseId: string }) {
  const [strategies, setStrategies] = useState<InterventionSupportStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [strategyText, setStrategyText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStrategies = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('intervention_support_strategies')
      .select('*')
      .eq('intervention_case_id', caseId)
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setStrategies((data || []) as InterventionSupportStrategy[]);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { loadStrategies(); }, [loadStrategies]);

  async function addStrategy(e: React.FormEvent) {
    e.preventDefault();
    if (!strategyText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('intervention_support_strategies')
        .insert({
          intervention_case_id: caseId,
          strategy_text: strategyText.trim(),
          status: 'active',
        });
      if (err) throw err;
      setStrategyText('');
      await loadStrategies();
    } catch (err: any) {
      setError(err.message || 'Failed to add strategy.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStrategy(s: InterventionSupportStrategy) {
    const newStatus = s.status === 'active' ? 'completed' : 'active';
    const { error: err } = await supabase
      .from('intervention_support_strategies')
      .update({ status: newStatus })
      .eq('id', s.id);
    if (err) {
      setError(err.message);
      return;
    }
    await loadStrategies();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={addStrategy} className="space-y-3">
        <label className="label" htmlFor="strategy-text">Add Support Strategy</label>
        <textarea
          id="strategy-text"
          value={strategyText}
          onChange={(e) => setStrategyText(e.target.value)}
          className="input min-h-[80px] resize-y"
          placeholder="e.g. Provide additional numeracy workbook sessions focused on fractions and decimals..."
          disabled={submitting}
        />
        <div className="flex items-center justify-end">
          <button type="submit" className="btn-primary" disabled={submitting || !strategyText.trim()}>
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lightbulb className="w-4 h-4" />
            )}
            Add Strategy
          </button>
        </div>
      </form>

      {error && (
        <div className="card p-3 border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading strategies...
        </div>
      ) : strategies.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Lightbulb className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No support strategies yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((s) => (
            <div key={s.id} className="card p-4 flex items-start gap-3">
              <button
                onClick={() => toggleStrategy(s)}
                className="mt-0.5 shrink-0"
                title={s.status === 'active' ? 'Mark as completed' : 'Mark as active'}
              >
                {s.status === 'active' ? (
                  <Circle className="w-5 h-5 text-slate-400 hover:text-primary-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${s.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {s.strategy_text}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`badge ${STRATEGY_BADGE[s.status]}`}>
                    {s.status === 'active' ? 'Active' : 'Completed'}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(s.created_at)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReassessmentTab({
  caseId, caseStatus, onSchedule, onUpdateStatus, onCaseUpdated,
}: {
  caseId: string;
  caseStatus: InterventionStatus;
  onSchedule: (caseId: string, date: string) => Promise<void>;
  onUpdateStatus: (r: InterventionReassessment, newStatus: InterventionReassessment['status']) => Promise<void>;
  onCaseUpdated: (updated: CaseWithJoins | null) => Promise<void>;
}) {
  const [reassessments, setReassessments] = useState<InterventionReassessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduledDate, setScheduledDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReassessments = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('intervention_reassessments')
      .select('*')
      .eq('intervention_case_id', caseId)
      .order('scheduled_date', { ascending: false });
    if (err) setError(err.message);
    else setReassessments((data || []) as InterventionReassessment[]);
    setLoading(false);
  }, [caseId]);

  useEffect(() => { loadReassessments(); }, [loadReassessments]);

  async function schedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledDate) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSchedule(caseId, scheduledDate);
      setScheduledDate('');
      await loadReassessments();
      await onCaseUpdated(null);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule reassessment.');
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(r: InterventionReassessment, newStatus: InterventionReassessment['status']) {
    setError(null);
    try {
      await onUpdateStatus(r, newStatus);
      await loadReassessments();
    } catch (err: any) {
      setError(err.message || 'Failed to update reassessment.');
    }
  }

  return (
    <div className="space-y-4">
      {caseStatus !== 'closed' && (
        <form onSubmit={schedule} className="card p-4 space-y-3">
          <label className="label" htmlFor="reassessment-date">Schedule New Reassessment</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              id="reassessment-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              className="input flex-1"
              disabled={submitting}
              required
            />
            <button type="submit" className="btn-primary sm:w-auto" disabled={submitting || !scheduledDate}>
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CalendarClock className="w-4 h-4" />
              )}
              Schedule
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="card p-3 border-rose-200 bg-rose-50">
          <p className="text-sm text-rose-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading reassessments...
        </div>
      ) : reassessments.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <CalendarClock className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm">No reassessments scheduled.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reassessments.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {formatDate(r.scheduled_date)}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Created {formatDate(r.created_at)}
                    </div>
                  </div>
                </div>
                <span className={`badge ${REASSESSMENT_BADGE[r.status]}`}>
                  {r.status === 'scheduled' ? 'Scheduled' : r.status === 'completed' ? 'Completed' : 'No Show'}
                </span>
              </div>
              {r.status === 'scheduled' && caseStatus !== 'closed' && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => updateStatus(r, 'completed')}
                    className="btn-secondary text-xs px-2.5 py-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Mark Completed
                  </button>
                  <button
                    onClick={() => updateStatus(r, 'no_show')}
                    className="btn-secondary text-xs px-2.5 py-1 text-rose-600"
                  >
                    <X className="w-3.5 h-3.5" />
                    Mark No Show
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
