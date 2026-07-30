import { ArrowRight, Building2, Users, ClipboardList, Brain, Calendar } from 'lucide-react';
import { TopNav } from '../../components/marketing/TopNav';
import { Footer } from '../../components/marketing/Footer';

function nav(hash: string) { window.location.href = hash; }

const STEPS = [
  {
    n: 1,
    icon: Building2,
    title: 'Create your organisation',
    desc: 'Sign up online in minutes. No sales call, no contract. Enter your RTO name, RTO number and choose a plan. Your 14-day free trial starts immediately.',
    detail: ['Self-service sign up', 'Choose your plan online', 'No credit card required', 'Start immediately'],
    color: 'bg-primary-100 text-primary-600',
    border: 'border-primary-200',
  },
  {
    n: 2,
    icon: Users,
    title: 'Invite your trainers',
    desc: 'Add your training team to the platform. Unlimited trainers are included on every plan — no per-seat fees. Trainers get full access to manage candidates and review results.',
    detail: ['Unlimited trainers included', 'Email invitations', 'Role-based access', 'Multiple campuses supported'],
    color: 'bg-teal-100 text-teal-600',
    border: 'border-teal-200',
  },
  {
    n: 3,
    icon: ClipboardList,
    title: 'Assess your learners',
    desc: 'Send assessment invitations by email. Learners complete assessments on any device in around 20 minutes. No account creation required for learners — just a link.',
    detail: ['Invitation via email', 'Works on any device', 'No learner account needed', 'Progress saved automatically'],
    color: 'bg-amber-100 text-amber-600',
    border: 'border-amber-200',
  },
  {
    n: 4,
    icon: Brain,
    title: 'Download reports instantly',
    desc: 'As soon as a learner completes their assessment, an AI-generated ACSF-mapped report is ready. Trainers review, approve, and can send support plans to learners in one click.',
    detail: ['AI-generated reports', 'ACSF mapping included', 'Support plans auto-drafted', 'Audit-ready evidence trail'],
    color: 'bg-emerald-100 text-emerald-600',
    border: 'border-emerald-200',
  },
];

export function HowItWorksPage({ currentHash }: { currentHash: string }) {
  return (
    <div className="min-h-screen bg-white">
      <TopNav currentHash={currentHash} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white pt-28 pb-16 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-4">How It Works</p>
          <h1 className="text-5xl font-extrabold text-slate-900 mb-4 leading-tight">From sign up to first report in under an hour</h1>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">No implementation project. No IT involvement. No training required. Just a simple, self-service platform designed for busy RTOs.</p>
        </div>
      </section>

      {/* Steps */}
      <section className="py-20 px-4 max-w-5xl mx-auto">
        <div className="space-y-16">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isRight = i % 2 !== 0;
            return (
              <div key={step.n} className={`grid grid-cols-1 md:grid-cols-2 gap-10 items-center ${isRight ? 'md:flex-row-reverse' : ''}`}>
                <div className={isRight ? 'md:order-2' : ''}>
                  <div className={`inline-flex items-center gap-2 border-2 ${step.border} rounded-full px-4 py-1.5 text-xs font-bold mb-5`}>
                    <span className={`w-5 h-5 rounded-full ${step.color} flex items-center justify-center text-xs font-extrabold`}>{step.n}</span>
                    Step {step.n}
                  </div>
                  <h2 className="text-3xl font-extrabold text-slate-900 mb-3">{step.title}</h2>
                  <p className="text-slate-500 leading-relaxed mb-6">{step.desc}</p>
                  <ul className="space-y-2">
                    {step.detail.map((d) => (
                      <li key={d} className="flex items-center gap-2.5 text-sm text-slate-700 font-medium">
                        <div className={`w-5 h-5 rounded-full ${step.color} flex items-center justify-center flex-shrink-0`}>
                          <span className="text-[10px] font-extrabold">✓</span>
                        </div>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`${isRight ? 'md:order-1' : ''}`}>
                  <div className={`bg-gradient-to-br ${
                    i === 0 ? 'from-primary-50 to-primary-100' :
                    i === 1 ? 'from-teal-50 to-teal-100' :
                    i === 2 ? 'from-amber-50 to-amber-100' :
                    'from-emerald-50 to-emerald-100'
                  } rounded-3xl p-12 flex items-center justify-center aspect-square max-w-sm mx-auto`}>
                    <div className={`w-24 h-24 rounded-3xl ${step.color} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-12 h-12" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-primary-700 to-primary-900 text-white text-center px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-4">Start in minutes, not months</h2>
          <p className="text-primary-200 mb-8">14-day free trial. No credit card. No contract.</p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button onClick={() => nav('#/signup')} className="px-8 py-4 bg-white text-primary-700 font-extrabold rounded-xl hover:bg-primary-50 transition-all shadow-lg inline-flex items-center gap-2">
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </button>
            <button onClick={() => nav('#/contact')} className="px-8 py-4 border-2 border-white/30 text-white font-bold rounded-xl hover:bg-white/10 inline-flex items-center gap-2">
              <Calendar className="w-5 h-5" /> Book a Demo
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
