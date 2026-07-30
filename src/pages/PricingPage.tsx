import { useState, useEffect } from 'react';
import { Check, ArrowRight, Zap, Star, Calculator, TrendingDown, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { SubscriptionPlan } from '../lib/types';
import { TopNav } from '../components/marketing/TopNav';
import { Footer } from '../components/marketing/Footer';

function fmtCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDollars(dollars: number) {
  return `$${dollars.toFixed(2)}`;
}

function recommendPlan(plans: SubscriptionPlan[], learners: number): SubscriptionPlan | null {
  if (plans.length === 0) return null;
  // All plans have same included threshold and additional rate
  return plans.find((p) => p.id === 'lln_digital') ?? plans[plans.length - 1];
}

function calcMonthlyCost(plan: SubscriptionPlan, learners: number): number {
  const additional = Math.max(0, learners - plan.included_assessments);
  return (plan.platform_fee_cents + additional * plan.additional_assessment_cents) / 100;
}

const STATIC_PLANS: SubscriptionPlan[] = [
  {
    id: 'lln_only', name: 'LLN Only', description: 'Language, Literacy & Numeracy assessments', badge: null,
    platform_fee_cents: 7900, included_assessments: 50, additional_assessment_cents: 150,
    features: ['Unlimited admin users','Unlimited trainers','ACSF mapped assessments','LLN reports','Support plans','AI-generated reports','Audit-ready evidence','50 completed learner assessments/month'],
    active: true, sort_order: 1, created_at: '',
  },
  {
    id: 'digital_only', name: 'Digital Only', description: 'Digital Capability assessments', badge: null,
    platform_fee_cents: 7900, included_assessments: 50, additional_assessment_cents: 150,
    features: ['Unlimited admin users','Unlimited trainers','Digital capability assessments','Reports','Support plans','AI-generated reports','Audit-ready evidence','50 completed learner assessments/month'],
    active: true, sort_order: 2, created_at: '',
  },
  {
    id: 'lln_digital', name: 'LLN + Digital', description: 'Complete LLN and Digital Capability suite', badge: 'Most Popular',
    platform_fee_cents: 12900, included_assessments: 50, additional_assessment_cents: 150,
    features: ['Everything in LLN Only','Everything in Digital Only','Learner deduplication across both assessments','50 completed learner assessments/month'],
    active: true, sort_order: 3, created_at: '',
  },
];

export function PricingPage({ currentHash }: { currentHash: string }) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>(STATIC_PLANS);
  const [learners, setLearners] = useState(30);
  const [inputVal, setInputVal] = useState('30');

  useEffect(() => {
    supabase.from('subscription_plans').select('*').eq('active', true).order('sort_order')
      .then(({ data }) => { if (data && data.length > 0) setPlans(data); });
  }, []);

  const handleLearnerChange = (val: string) => {
    setInputVal(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 0) setLearners(Math.min(n, 500));
  };

  const recommended = recommendPlan(plans, learners);

  return (
    <div className="min-h-screen bg-slate-50">
      <TopNav currentHash={currentHash} />

      <main className="max-w-6xl mx-auto px-4 pt-28 pb-16">
        {/* Hero */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 bg-primary-50 text-primary-700 text-sm font-medium px-4 py-2 rounded-full mb-5 border border-primary-100">
            <Zap className="w-4 h-4" /> Only pay for learners you actually assess
          </div>
          <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight">
            Simple, transparent<br />pricing for RTOs
          </h1>
          <p className="text-lg text-slate-500 mt-4 max-w-2xl mx-auto">
            No seat licences. No wasted spend. Pay a flat monthly platform fee plus a small per-learner fee only when
            a learner successfully completes an assessment.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {plans.map((plan) => {
            const monthly = calcMonthlyCost(plan, learners);
            const isRec = plan.id === recommended?.id;
            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border-2 p-6 flex flex-col gap-5 bg-white transition-all ${
                  isRec
                    ? 'border-primary-500 shadow-xl shadow-primary-100'
                    : 'border-slate-200 hover:border-primary-200 hover:shadow-md'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="bg-primary-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 whitespace-nowrap">
                      <Star className="w-3 h-3" /> {plan.badge}
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">{plan.description}</p>
                </div>

                <div>
                  <div className="flex items-end gap-1">
                    <span className="text-3xl font-extrabold text-slate-900">{fmtCents(plan.platform_fee_cents)}</span>
                    <span className="text-slate-400 text-sm mb-1">/month</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">platform fee + {fmtCents(plan.additional_assessment_cents)}/extra learner</p>
                </div>

                {/* Live estimate */}
                {learners > 0 && (
                  <div className={`rounded-xl p-3 ${isRec ? 'bg-primary-50 border border-primary-100' : 'bg-slate-50'}`}>
                    <p className="text-xs text-slate-500 font-medium mb-1">
                      Estimated cost for {learners} learner{learners !== 1 ? 's' : ''}
                    </p>
                    <p className={`text-lg font-extrabold ${isRec ? 'text-primary-700' : 'text-slate-800'}`}>
                      {fmtDollars(monthly)}/month
                    </p>
                  </div>
                )}

                <ul className="space-y-2 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => { window.location.href = '#/signup'; }}
                  className={`w-full py-3 rounded-xl text-sm font-semibold text-center transition-all ${
                    isRec
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Start 14-day free trial
                </button>
              </div>
            );
          })}
        </div>

        {/* Calculator section */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-16">
          <div className="bg-gradient-to-r from-primary-600 to-primary-700 px-8 py-6 text-white">
            <div className="flex items-center gap-3 mb-1">
              <Calculator className="w-5 h-5" />
              <h2 className="text-xl font-bold">Pricing Calculator</h2>
            </div>
            <p className="text-primary-100 text-sm">Estimate your monthly cost instantly</p>
          </div>

          <div className="p-8">
            <div className="max-w-2xl mx-auto">
              {/* Slider */}
              <div className="mb-8">
                <label className="block text-sm font-semibold text-slate-700 mb-3">
                  Estimated learner assessments per month
                </label>
                <div className="flex items-center gap-4 mb-3">
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={5}
                    value={learners}
                    onChange={(e) => handleLearnerChange(e.target.value)}
                    className="flex-1 h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-primary-600"
                  />
                  <input
                    type="number"
                    min={0}
                    max={999}
                    value={inputVal}
                    onChange={(e) => handleLearnerChange(e.target.value)}
                    className="w-20 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-300"
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>0</span>
                  <span>50 (included)</span>
                  <span>100</span>
                  <span>150</span>
                  <span>200</span>
                  <span>250</span>
                  <span>300</span>
                </div>
              </div>

              {/* Results */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan) => {
                  const monthly = calcMonthlyCost(plan, learners);
                  const annual = monthly * 12;
                  const additional = Math.max(0, learners - plan.included_assessments);
                  const isRec = plan.id === recommended?.id;
                  return (
                    <div
                      key={plan.id}
                      className={`rounded-xl p-4 border-2 transition-all ${
                        isRec
                          ? 'border-primary-400 bg-primary-50'
                          : 'border-slate-100 bg-slate-50'
                      }`}
                    >
                      {isRec && (
                        <span className="text-xs font-bold text-primary-600 uppercase tracking-wide block mb-1">
                          Recommended
                        </span>
                      )}
                      <p className="font-bold text-slate-900">{plan.name}</p>
                      <div className="mt-2">
                        <p className="text-2xl font-extrabold text-slate-900">{fmtDollars(monthly)}</p>
                        <p className="text-xs text-slate-500">per month</p>
                      </div>
                      <div className="mt-3 text-xs text-slate-500 space-y-1">
                        <div className="flex justify-between">
                          <span>Platform fee</span>
                          <span className="font-medium">{fmtCents(plan.platform_fee_cents)}</span>
                        </div>
                        {additional > 0 && (
                          <div className="flex justify-between text-amber-600">
                            <span>{additional} × extra</span>
                            <span className="font-medium">{fmtDollars(additional * plan.additional_assessment_cents / 100)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                          <span>Annual</span>
                          <span className="font-semibold text-slate-700">{fmtDollars(annual)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {learners > 50 && (
                <div className="mt-6 flex items-start gap-3 bg-success-50 border border-success-200 rounded-xl px-4 py-3">
                  <TrendingDown className="w-5 h-5 text-success-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-success-700">
                    <span className="font-semibold">Better value vs. seat licences.</span>{' '}
                    Traditional platforms charge per licensed seat regardless of usage. With LLND Automate you only pay for the{' '}
                    {learners} learners who actually complete — never for idle seats.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FAQ / value props */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            {
              icon: Users,
              title: 'No seat limits',
              body: 'Add unlimited admin users, trainers, and campuses at no extra cost. Only completed learner assessments are billed.',
            },
            {
              icon: Zap,
              title: 'Learner deduplication',
              body: 'On the LLN + Digital plan, if the same learner completes both assessments, it counts as one — you are never charged twice.',
            },
            {
              icon: TrendingDown,
              title: 'Draft assessments are free',
              body: 'Only fully submitted and completed assessments count toward your billing. Incomplete, abandoned, or draft responses are never charged.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary-600" />
              </div>
              <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center bg-gradient-to-br from-primary-600 to-primary-800 rounded-2xl px-8 py-12 text-white">
          <h2 className="text-3xl font-extrabold mb-3">Start your free 14-day trial</h2>
          <p className="text-primary-200 mb-8 max-w-md mx-auto">No credit card required. Full access to all features. Cancel any time.</p>
          <button
            onClick={() => { window.location.href = '#/signup'; }}
            className="inline-flex items-center gap-2 bg-white text-primary-700 font-bold px-8 py-3.5 rounded-xl hover:bg-primary-50 transition-all shadow-lg"
          >
            Get Started Free <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-xs text-primary-300 mt-4">All prices in AUD, excluding GST</p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
