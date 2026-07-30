import { useEffect, useState, useCallback } from 'react';
import {
  CreditCard, Zap, TrendingUp, Calendar, CheckCircle2,
  AlertTriangle, XCircle, ChevronRight, Download, RefreshCw,
  Users, DollarSign, Package, ArrowUpRight, Clock, Loader2,
  Star, Shield, X, Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  Subscription, SubscriptionPlan, BillingUsage, BillableLearner, BillingEvent,
} from '../lib/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function daysRemaining(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function usagePercent(completed: number, included: number) {
  return Math.min(100, Math.round((completed / included) * 100));
}

function barColor(pct: number) {
  if (pct >= 100) return 'bg-error-500';
  if (pct >= 90)  return 'bg-warning-500';
  if (pct >= 75)  return 'bg-amber-400';
  return 'bg-primary-500';
}

function brandIcon(brand: string | null) {
  const b = brand?.toLowerCase() ?? '';
  if (b === 'visa') return '💳 Visa';
  if (b === 'mastercard') return '💳 Mastercard';
  if (b === 'amex') return '💳 Amex';
  return '💳 Card';
}

// ─── sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    trialing:  'bg-primary-50 text-primary-700 border border-primary-200',
    active:    'bg-success-50 text-success-700 border border-success-100',
    past_due:  'bg-error-50 text-error-700 border border-error-100',
    paused:    'bg-slate-100 text-slate-600 border border-slate-200',
    cancelled: 'bg-slate-100 text-slate-500 border border-slate-200',
    incomplete:'bg-warning-50 text-warning-700 border border-warning-100',
  };
  const labels: Record<string, string> = {
    trialing:  'Free Trial',
    active:    'Active',
    past_due:  'Payment Due',
    paused:    'Paused',
    cancelled: 'Cancelled',
    incomplete:'Incomplete',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] ?? 'bg-slate-100 text-slate-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-success-500' : status === 'trialing' ? 'bg-primary-500' : status === 'past_due' ? 'bg-error-500' : 'bg-slate-400'}`} />
      {labels[status] ?? status}
    </span>
  );
}

interface PlanCardProps {
  plan: SubscriptionPlan;
  current: boolean;
  onSelect: (id: string) => void;
  loading: boolean;
}
function PlanCard({ plan, current, onSelect, loading }: PlanCardProps) {
  return (
    <div className={`relative rounded-2xl border-2 p-6 flex flex-col gap-4 transition-all ${
      current
        ? 'border-primary-500 bg-primary-50/50 shadow-lg shadow-primary-100'
        : 'border-slate-200 bg-white hover:border-primary-300 hover:shadow-md'
    }`}>
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
            <Star className="w-3 h-3" /> {plan.badge}
          </span>
        </div>
      )}
      {current && (
        <div className="absolute -top-3 right-4">
          <span className="bg-success-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
            <Check className="w-3 h-3" /> Current Plan
          </span>
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
        <p className="text-sm text-slate-500 mt-0.5">{plan.description}</p>
      </div>

      <div className="flex items-end gap-1">
        <span className="text-3xl font-extrabold text-slate-900">{fmtCents(plan.platform_fee_cents)}</span>
        <span className="text-slate-400 text-sm mb-1">/month</span>
      </div>

      <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
        Includes {plan.included_assessments} learner assessments &bull;{' '}
        {fmtCents(plan.additional_assessment_cents)} each additional
      </div>

      <ul className="space-y-2 flex-1">
        {(plan.features as string[]).map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <Check className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan.id)}
        disabled={current || loading}
        className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
          current
            ? 'bg-slate-100 text-slate-400 cursor-default'
            : 'bg-primary-600 text-white hover:bg-primary-700 active:scale-95'
        }`}
      >
        {current ? 'Current Plan' : 'Switch to This Plan'}
      </button>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function BillingPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [learners, setLearners] = useState<BillableLearner[]>([]);
  const [events, setEvents] = useState<BillingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showLearnerList, setShowLearnerList] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: plansData }, { data: subData }] = await Promise.all([
        supabase.from('subscription_plans').select('*').eq('active', true).order('sort_order'),
        supabase.from('subscriptions').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setPlans(plansData ?? []);

      if (subData) {
        setSubscription(subData);
        const plan = plansData?.find((p) => p.id === subData.plan_id) ?? null;
        setCurrentPlan(plan);

        // Load current usage period
        const periodStart = subData.current_period_start
          ? new Date(subData.current_period_start).toISOString()
          : new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

        const [{ data: usageData }, { data: eventsData }] = await Promise.all([
          supabase.from('billing_usage')
            .select('*')
            .eq('subscription_id', subData.id)
            .eq('period_start', periodStart)
            .maybeSingle(),
          supabase.from('billing_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        setUsage(usageData ?? null);
        setEvents(eventsData ?? []);

        if (usageData) {
          const { data: learnersData } = await supabase
            .from('billable_learners')
            .select('*')
            .eq('billing_period_id', usageData.id)
            .order('first_completed_at', { ascending: false });
          setLearners(learnersData ?? []);
        }
      }
    } catch {
      showToast('error', 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { load(); }, [load]);

  const createTrial = async (planId: string) => {
    setActionLoading(true);
    const trialEnd = new Date(Date.now() + 14 * 86_400_000).toISOString();
    const periodStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const periodEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString();
    const { error } = await supabase.from('subscriptions').insert({
      plan_id: planId,
      status: 'trialing',
      trial_ends_at: trialEnd,
      current_period_start: periodStart,
      current_period_end: periodEnd,
    });
    if (error) { showToast('error', 'Failed to start trial'); }
    else { showToast('success', 'Free trial started!'); }
    setActionLoading(false);
    load();
  };

  const changePlan = async (planId: string) => {
    if (!subscription) { await createTrial(planId); return; }
    setActionLoading(true);
    const { error } = await supabase.from('subscriptions').update({ plan_id: planId, updated_at: new Date().toISOString() }).eq('id', subscription.id);
    if (error) showToast('error', 'Failed to change plan');
    else { showToast('success', 'Plan updated'); setShowPlanPicker(false); }
    setActionLoading(false);
    load();
  };

  const cancelSubscription = async () => {
    if (!subscription) return;
    setActionLoading(true);
    const { error } = await supabase.from('subscriptions').update({
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    }).eq('id', subscription.id);
    if (error) showToast('error', 'Failed to cancel subscription');
    else { showToast('success', 'Subscription will cancel at end of period'); setShowCancelModal(false); }
    setActionLoading(false);
    load();
  };

  const reactivate = async () => {
    if (!subscription) return;
    setActionLoading(true);
    const { error } = await supabase.from('subscriptions').update({
      cancel_at_period_end: false,
      cancelled_at: null,
      status: subscription.status === 'cancelled' ? 'active' : subscription.status,
      updated_at: new Date().toISOString(),
    }).eq('id', subscription.id);
    if (error) showToast('error', 'Failed to reactivate');
    else showToast('success', 'Subscription reactivated');
    setActionLoading(false);
    load();
  };

  // Calculated values
  const included = currentPlan?.included_assessments ?? 50;
  const completed = usage?.completed_learners ?? 0;
  const additional = Math.max(0, completed - included);
  const remaining = Math.max(0, included - completed);
  const pct = usagePercent(completed, included);
  const platformFee = currentPlan?.platform_fee_cents ?? 0;
  const additionalCost = additional * (currentPlan?.additional_assessment_cents ?? 150);
  const estimatedTotal = platformFee + additionalCost;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-400" />
      </div>
    );
  }

  // ── No subscription yet: show plan picker ───────────────────────────────
  if (!subscription) {
    return (
      <div className="max-w-5xl mx-auto animate-fade-in">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 text-sm font-medium px-4 py-2 rounded-full mb-4 border border-primary-100">
            <Zap className="w-4 h-4" /> 14-day free trial — no credit card required
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900">Choose your plan</h1>
          <p className="text-slate-500 mt-2 max-w-lg mx-auto">
            Only pay for the learners you actually assess. No licence seats. No wasted spend.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              current={false}
              onSelect={changePlan}
              loading={actionLoading}
            />
          ))}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          All plans include a 14-day free trial. Prices in AUD + GST.
        </p>

        {toast && <Toast {...toast} />}
      </div>
    );
  }

  // ── Active subscription view ────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {toast && <Toast {...toast} />}

      {/* Stripe not configured banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <span className="font-semibold">Stripe not yet connected.</span>{' '}
          Usage is tracked automatically. Add your Stripe API key in{' '}
          <span className="font-medium">Settings → Billing</span> to enable payment processing and invoicing.
        </div>
      </div>

      {/* Trial / past-due banners */}
      {subscription.status === 'trialing' && subscription.trial_ends_at && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary-500 flex-shrink-0" />
          <p className="text-sm text-primary-800">
            <span className="font-semibold">Free trial</span> — {daysRemaining(subscription.trial_ends_at)} days
            remaining. Ends {fmtDate(subscription.trial_ends_at)}.
          </p>
        </div>
      )}
      {subscription.status === 'past_due' && (
        <div className="bg-error-50 border border-error-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-error-500 flex-shrink-0" />
          <p className="text-sm text-error-800 font-medium">
            Payment overdue — your account may be paused if payment is not received soon.
          </p>
        </div>
      )}
      {subscription.cancel_at_period_end && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-slate-400 flex-shrink-0" />
            <p className="text-sm text-slate-700">
              Subscription cancels on{' '}
              <strong>{subscription.current_period_end ? fmtDate(subscription.current_period_end) : 'end of period'}</strong>.
              You can reactivate before then.
            </p>
          </div>
          <button
            onClick={reactivate}
            disabled={actionLoading}
            className="text-sm font-semibold text-primary-600 hover:text-primary-800 whitespace-nowrap"
          >
            Reactivate
          </button>
        </div>
      )}

      {/* Top row: plan + billing period */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current plan card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Current Plan</p>
              <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                {currentPlan?.name ?? 'No plan selected'}
              </h2>
            </div>
            <StatusBadge status={subscription.status} />
          </div>
          {currentPlan && (
            <div className="flex items-end gap-1 mb-4">
              <span className="text-3xl font-extrabold text-slate-900">{fmtCents(currentPlan.platform_fee_cents)}</span>
              <span className="text-slate-400 text-sm mb-1">/month</span>
            </div>
          )}
          <p className="text-sm text-slate-500">{currentPlan?.description}</p>
          <button
            onClick={() => setShowPlanPicker(true)}
            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all"
          >
            Change Plan <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Billing period card */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Billing Period</p>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Period Start
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {subscription.current_period_start ? fmtDate(subscription.current_period_start) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Period End
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {subscription.current_period_end ? fmtDate(subscription.current_period_end) : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-2">
                <Package className="w-4 h-4" /> Included Assessments
              </span>
              <span className="text-sm font-semibold text-slate-900">{included}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-500 flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Additional Rate
              </span>
              <span className="text-sm font-semibold text-slate-900">
                {fmtCents(currentPlan?.additional_assessment_cents ?? 150)}/learner
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Usage card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Usage This Period</p>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">Learner Assessments Completed</h3>
          </div>
          <button
            onClick={() => setShowLearnerList(!showLearnerList)}
            className="text-xs text-primary-600 font-semibold hover:text-primary-800 flex items-center gap-1"
          >
            <Users className="w-3.5 h-3.5" />
            {showLearnerList ? 'Hide' : 'View'} learners
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-semibold text-slate-700">{completed} completed</span>
            <span className="text-slate-400">{included} included</span>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor(pct)}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs mt-2 text-slate-500">
            <span>{remaining > 0 ? `${remaining} remaining` : `${Math.abs(remaining)} over limit`}</span>
            <span>{pct}%</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-2xl font-extrabold text-slate-900">{included}</p>
            <p className="text-xs text-slate-500 mt-0.5">Included</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className={`text-2xl font-extrabold ${completed > included ? 'text-error-600' : 'text-slate-900'}`}>{completed}</p>
            <p className="text-xs text-slate-500 mt-0.5">Completed</p>
          </div>
          <div className={`rounded-xl p-4 text-center ${additional > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
            <p className={`text-2xl font-extrabold ${additional > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{additional}</p>
            <p className="text-xs text-slate-500 mt-0.5">Additional</p>
          </div>
        </div>

        {/* Learner list */}
        {showLearnerList && learners.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Billable Learners</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                    <th className="pb-2 font-semibold">Learner</th>
                    <th className="pb-2 font-semibold text-center">LLN</th>
                    <th className="pb-2 font-semibold text-center">Digital</th>
                    <th className="pb-2 font-semibold text-right">Completed</th>
                  </tr>
                </thead>
                <tbody>
                  {learners.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5">
                        <p className="font-medium text-slate-900">{l.learner_name || '—'}</p>
                        <p className="text-xs text-slate-400">{l.learner_email}</p>
                      </td>
                      <td className="py-2.5 text-center">
                        {l.completed_lln ? <CheckCircle2 className="w-4 h-4 text-success-500 mx-auto" /> : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="py-2.5 text-center">
                        {l.completed_digital ? <CheckCircle2 className="w-4 h-4 text-success-500 mx-auto" /> : <span className="text-slate-200">—</span>}
                      </td>
                      <td className="py-2.5 text-right text-slate-500 text-xs">{fmtDate(l.first_completed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {showLearnerList && learners.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4 mt-4 border-t border-slate-100">No completed learner assessments yet this period.</p>
        )}
      </div>

      {/* Estimated invoice */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Estimated Invoice</p>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-700">Platform fee — {currentPlan?.name}</span>
            <span className="text-sm font-semibold text-slate-900">{fmtCents(platformFee)}</span>
          </div>
          <div className="flex justify-between items-center text-sm text-slate-500">
            <span>Included learner assessments ({included})</span>
            <span className="font-medium text-slate-700">Included</span>
          </div>
          {additional > 0 && (
            <div className="flex justify-between items-center text-sm text-amber-700">
              <span>{additional} × additional learner assessments @ {fmtCents(currentPlan?.additional_assessment_cents ?? 150)}</span>
              <span className="font-semibold">{fmtCents(additionalCost)}</span>
            </div>
          )}
          <div className="border-t border-slate-100 pt-3 mt-3 flex justify-between items-center">
            <span className="text-base font-bold text-slate-900">Estimated Total</span>
            <span className="text-2xl font-extrabold text-slate-900">{fmtCents(estimatedTotal)}</span>
          </div>
          <p className="text-xs text-slate-400">Estimate based on current usage. Final amount determined at period end. Excludes GST.</p>
        </div>

        {/* Threshold notifications */}
        {usage && (
          <div className="mt-5 pt-5 border-t border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Usage Notifications</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: '75%', sent: usage.notified_75, milestone: Math.round(included * 0.75) },
                { label: '90%', sent: usage.notified_90, milestone: Math.round(included * 0.9) },
                { label: '100%', sent: usage.notified_100, milestone: included },
              ].map(({ label, sent, milestone }) => (
                <span key={label} className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                  sent ? 'bg-success-50 text-success-700 border-success-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}>
                  {sent ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                  {label} alert ({milestone} learners) {sent ? 'sent' : 'pending'}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Payment method */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Payment Method</p>
          <button
            className="text-xs text-primary-600 font-semibold hover:text-primary-800 flex items-center gap-1 opacity-50 cursor-not-allowed"
            title="Requires Stripe connection"
            disabled
          >
            <CreditCard className="w-3.5 h-3.5" /> Update card
          </button>
        </div>
        {subscription.payment_method_last4 ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-7 bg-slate-100 rounded flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {brandIcon(subscription.payment_method_brand)} ending {subscription.payment_method_last4}
              </p>
              <p className="text-xs text-slate-400">
                Expires {subscription.payment_method_exp_month}/{subscription.payment_method_exp_year}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 py-3 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <CreditCard className="w-5 h-5 text-slate-300" />
            <p className="text-sm text-slate-400">No payment method on file — add Stripe key to enable billing</p>
          </div>
        )}
      </div>

      {/* Billing history */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Billing History</p>
          <button
            onClick={load}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
            <TrendingUp className="w-8 h-8 text-slate-200" />
            <p className="text-sm">No billing history yet</p>
            <p className="text-xs text-slate-300">Invoices and payment events will appear here once Stripe is connected</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="pb-2 font-semibold">Date</th>
                <th className="pb-2 font-semibold">Event</th>
                <th className="pb-2 font-semibold text-right">Amount</th>
                <th className="pb-2 font-semibold text-right">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-3 text-slate-500 whitespace-nowrap">{fmtDate(ev.created_at)}</td>
                  <td className="py-3 text-slate-900 font-medium">{ev.description ?? ev.event_type}</td>
                  <td className="py-3 text-right font-semibold text-slate-900">
                    {ev.amount_cents != null ? fmtCents(ev.amount_cents) : '—'}
                  </td>
                  <td className="py-3 text-right">
                    {ev.invoice_pdf ? (
                      <a href={ev.invoice_pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800">
                        <Download className="w-3.5 h-3.5" /> PDF
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-4">Subscription Management</p>
        <div className="flex flex-wrap gap-3">
          {subscription.cancel_at_period_end || subscription.status === 'cancelled' ? (
            <button
              onClick={reactivate}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-success-200 bg-success-50 text-success-700 text-sm font-semibold hover:bg-success-100 transition-all disabled:opacity-50"
            >
              <ArrowUpRight className="w-4 h-4" /> Reactivate Subscription
            </button>
          ) : (
            <button
              onClick={() => setShowCancelModal(true)}
              disabled={actionLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-error-200 bg-error-50 text-error-700 text-sm font-semibold hover:bg-error-100 transition-all disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" /> Cancel Subscription
            </button>
          )}
          <button
            onClick={() => setShowPlanPicker(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all"
          >
            <Shield className="w-4 h-4" /> Change Plan
          </button>
        </div>
        {(subscription.cancel_at_period_end || subscription.status === 'cancelled') && (
          <p className="text-xs text-slate-400 mt-3">
            Reactivating will resume billing at your current plan rate from the next period.
          </p>
        )}
      </div>

      {/* Plan picker modal */}
      {showPlanPicker && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Change Plan</h2>
              <button onClick={() => setShowPlanPicker(false)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  current={plan.id === subscription.plan_id}
                  onSelect={changePlan}
                  loading={actionLoading}
                />
              ))}
            </div>
            <p className="text-center text-xs text-slate-400 pb-6">Plan changes take effect immediately. Prices in AUD + GST.</p>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-start gap-4 mb-5">
              <div className="w-10 h-10 rounded-full bg-error-100 flex items-center justify-center flex-shrink-0">
                <XCircle className="w-5 h-5 text-error-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Cancel Subscription?</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Your subscription will remain active until{' '}
                  <strong>{subscription.current_period_end ? fmtDate(subscription.current_period_end) : 'end of period'}</strong>.
                  You can reactivate before then. Usage data is preserved.
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Keep Subscription
              </button>
              <button
                onClick={cancelSubscription}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-error-600 text-white text-sm font-semibold hover:bg-error-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel at Period End'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

function Toast({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border animate-slide-up ${
      type === 'success' ? 'bg-success-50 border-success-200 text-success-800' : 'bg-error-50 border-error-200 text-error-800'
    }`}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
      <span className="text-sm font-medium">{msg}</span>
    </div>
  );
}
