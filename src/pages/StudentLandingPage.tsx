import { useEffect, useState, useCallback } from 'react';
import {
  BookOpen, Monitor, CheckCircle2, Clock, ArrowRight,
  PlayCircle, Trophy, GraduationCap, Loader2, AlertCircle,
  Calendar, RefreshCw,
} from 'lucide-react';
import { createQuizClient } from '../lib/supabase';
import type { AssessmentInvitation } from '../lib/types';
import { logAuditAnon } from '../lib/audit';

type AssessmentStatus = 'not_started' | 'in_progress' | 'completed';

interface AssessmentCard {
  id: string;
  type: 'lln' | 'digital' | 'legacy';
  title: string;
  description: string;
  estimatedTime: string;
  status: AssessmentStatus;
  link: string;
}

type Phase = 'loading' | 'invalid' | 'ready';

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isOverdue(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

const STATUS_CONFIG: Record<AssessmentStatus, {
  label: string;
  badgeClass: string;
  Icon: typeof CheckCircle2;
}> = {
  not_started: {
    label: 'Not Started',
    badgeClass: 'bg-slate-100 text-slate-600',
    Icon: Clock,
  },
  in_progress: {
    label: 'In Progress',
    badgeClass: 'bg-amber-100 text-amber-700',
    Icon: PlayCircle,
  },
  completed: {
    label: 'Completed',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    Icon: CheckCircle2,
  },
};

function StatusBadge({ status }: { status: AssessmentStatus }) {
  const { label, badgeClass, Icon } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badgeClass}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

export function StudentLandingPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [invitation, setInvitation] = useState<AssessmentInvitation | null>(null);
  const [rtoName, setRtoName] = useState('Your Training Provider');
  const [cards, setCards] = useState<AssessmentCard[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const quizClient = createQuizClient(token);

  const completedCount = cards.filter((c) => c.status === 'completed').length;
  const allComplete = cards.length > 0 && completedCount === cards.length;

  const loadData = useCallback(async (showRefreshSpinner = false) => {
    if (showRefreshSpinner) setRefreshing(true);

    const { data: inv } = await quizClient
      .from('assessment_invitations')
      .select('*')
      .eq('unique_token', token)
      .maybeSingle();

    if (!inv) {
      setPhase('invalid');
      if (showRefreshSpinner) setRefreshing(false);
      return;
    }

    setInvitation(inv as AssessmentInvitation);
    const anyInv = inv as any;
    if (anyInv.rto_name) setRtoName(anyInv.rto_name);

    const origin = window.location.origin;
    const builtCards: AssessmentCard[] = [];

    // New-style: separate LLN and Digital tokens
    if (anyInv.lln_token) {
      const rawStatus: string | null = anyInv.lln_status;
      const status: AssessmentStatus =
        rawStatus === 'completed' ? 'completed' :
        rawStatus === 'in_progress' ? 'in_progress' :
        'not_started';
      builtCards.push({
        id: 'lln',
        type: 'lln',
        title: 'LLN Assessment',
        description: 'Explore your Language, Literacy, Numeracy and Learning skills through a series of adaptive questions designed to help your trainer support you.',
        estimatedTime: '25–45 minutes',
        status,
        link: `${origin}/#/lln/${anyInv.lln_token}`,
      });
    }

    if (anyInv.digital_token) {
      const rawStatus: string | null = anyInv.digital_status;
      const status: AssessmentStatus =
        rawStatus === 'completed' ? 'completed' :
        rawStatus === 'in_progress' ? 'in_progress' :
        'not_started';
      builtCards.push({
        id: 'digital',
        type: 'digital',
        title: 'Digital Capability Assessment',
        description: 'Discover your confidence and capability with workplace digital technology across five key areas.',
        estimatedTime: '15–20 minutes',
        status,
        link: `${origin}/#/digital/${anyInv.digital_token}`,
      });
    }

    // Legacy: fall back to invitation_assessments if no separate tokens
    if (builtCards.length === 0) {
      const { data: invAsses } = await quizClient
        .from('invitation_assessments')
        .select('*, assessment:assessments(id, title, description, type, total_questions)')
        .eq('invitation_id', inv.id);

      for (const ia of (invAsses || [])) {
        const assessment = (ia as any).assessment;
        if (!assessment) continue;
        const rawStatus: string = ia.individual_status || 'pending';
        const status: AssessmentStatus =
          rawStatus === 'completed' ? 'completed' :
          rawStatus === 'in_progress' ? 'in_progress' :
          'not_started';
        builtCards.push({
          id: ia.id,
          type: assessment.type === 'lln' ? 'lln' : assessment.type === 'digital' ? 'digital' : 'legacy',
          title: assessment.title,
          description: assessment.description || '',
          estimatedTime: assessment.type === 'lln' ? '25–45 minutes' : '15–20 minutes',
          status,
          link: `${origin}/#/quiz/${token}`,
        });
      }
    }

    setCards(builtCards);

    if (inv.status === 'sent' && !inv.opened_at) {
      await quizClient
        .from('assessment_invitations')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('id', inv.id);

      logAuditAnon({
        event_type: 'invitation.opened',
        category: 'student_activity',
        description: `${(inv as any).candidate_name} opened their assessment portal`,
        source: 'student',
        invitation_id: inv.id,
      }, token);
    }

    setPhase('ready');
    if (showRefreshSpinner) setRefreshing(false);
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refresh when the tab regains focus (student returning from assessment)
  useEffect(() => {
    const onFocus = () => loadData(true);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  function launchAssessment(card: AssessmentCard) {
    window.location.hash = card.link.split('#')[1] || card.link;
  }

  // ─── LOADING ────────────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center animate-pulse">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <p className="text-slate-500 text-sm">Loading your assessment portal…</p>
        </div>
      </div>
    );
  }

  // ─── INVALID ────────────────────────────────────────────────────────────────
  if (phase === 'invalid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-slate-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Link Not Found</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            This assessment link is not valid or may have expired. Please contact your trainer for a new link.
          </p>
        </div>
      </div>
    );
  }

  const dueDate = (invitation as any)?.due_date || null;
  const overdue = isOverdue(dueDate) && !allComplete;

  // ─── READY ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">

      {/* ── Header bar ── */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">{rtoName}</p>
              <p className="text-xs text-slate-500">Student Assessment Portal</p>
            </div>
          </div>
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-40"
            title="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">

        {/* ── Welcome section ── */}
        {allComplete ? (
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl p-6 sm:p-8 text-white text-center shadow-lg">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Congratulations!</h1>
            <p className="text-emerald-100 text-base leading-relaxed mb-2">
              You have completed all assigned assessments. Your results have been submitted successfully.
            </p>
            <p className="text-emerald-100 text-sm leading-relaxed">
              Your trainer will review your results and be in touch with next steps. There is nothing further you need to do. You can exit this screen now.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">Welcome</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
                  {invitation?.candidate_name}
                </h1>
                <p className="text-slate-600 text-sm leading-relaxed">
                  Your training organisation has asked you to complete the following assessment{cards.length !== 1 ? 's' : ''}.
                  Please complete {cards.length !== 1 ? 'each assessment' : 'it'} before the due date shown below.
                </p>
              </div>
            </div>

            {/* Progress */}
            <div className="mt-5 pt-5 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">Your progress</span>
                <span className="text-xs font-semibold text-slate-700">{completedCount} of {cards.length} complete</span>
              </div>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-700 ease-out"
                  style={{ width: cards.length > 0 ? `${(completedCount / cards.length) * 100}%` : '0%' }}
                />
              </div>
            </div>

            {/* Due date */}
            {dueDate && (
              <div className={`mt-4 flex items-center gap-2 text-sm ${overdue ? 'text-rose-600' : 'text-slate-500'}`}>
                <Calendar className="w-4 h-4 shrink-0" />
                <span>
                  {overdue ? 'Overdue — was due' : 'Due by'}{' '}
                  <span className="font-semibold">{formatDate(dueDate)}</span>
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Assessment cards ── */}
        <div className="space-y-4">
          {cards.map((card, index) => {
            const isLLN = card.type === 'lln';
            const isDone = card.status === 'completed';
            const isActive = card.status === 'in_progress';
            const iconBg = isLLN ? 'bg-blue-50' : 'bg-emerald-50';
            const iconColor = isLLN ? 'text-blue-600' : 'text-emerald-600';
            const CardIcon = isLLN ? BookOpen : Monitor;

            return (
              <div
                key={card.id}
                className={`bg-white rounded-2xl border shadow-sm transition-all duration-300 overflow-hidden ${
                  isDone ? 'border-emerald-200' : isActive ? 'border-amber-200' : 'border-slate-200'
                }`}
              >
                {/* Completion stripe */}
                {isDone && (
                  <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-400" />
                )}
                {isActive && (
                  <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-400" />
                )}

                <div className="p-6 sm:p-7">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center shrink-0`}>
                      <CardIcon className={`w-6 h-6 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900">{card.title}</h2>
                        <StatusBadge status={card.status} />
                      </div>
                      <p className="text-slate-500 text-sm leading-relaxed mb-3">{card.description}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{card.estimatedTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Action area */}
                  <div className="mt-5 pt-4 border-t border-slate-100">
                    {isDone ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-sm font-semibold">Assessment submitted successfully</span>
                        </div>
                        <button
                          onClick={() => launchAssessment(card)}
                          className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
                        >
                          View Summary
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => launchAssessment(card)}
                        className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-[0.98] shadow-sm ${
                          isActive
                            ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200'
                            : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
                        }`}
                      >
                        {isActive ? (
                          <>
                            <PlayCircle className="w-4 h-4" />
                            Continue Assessment
                          </>
                        ) : (
                          <>
                            Start Assessment
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── No assessments ── */}
        {cards.length === 0 && phase === 'ready' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
            <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900 mb-1">No assessments assigned</h3>
            <p className="text-sm text-slate-500">
              No assessments have been assigned to your account yet. Please contact your trainer.
            </p>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="text-center pb-8">
          <p className="text-xs text-slate-400">
            Having trouble? Contact your trainer or training organisation for assistance.
          </p>
          <p className="text-xs text-slate-300 mt-1">{rtoName}</p>
        </div>
      </div>
    </div>
  );
}
