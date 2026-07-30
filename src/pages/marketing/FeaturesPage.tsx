import {
  Brain, Target, Monitor, Package, Clock, AlertTriangle,
  ClipboardList, ShieldCheck, Zap, DollarSign, Users, Building2,
  ArrowRight, Calendar, Check,
} from 'lucide-react';
import { TopNav } from '../../components/marketing/TopNav';
import { Footer } from '../../components/marketing/Footer';

function nav(hash: string) { window.location.href = hash; }

const SECTIONS = [
  {
    tag: 'Assessment',
    heading: 'LLN & Digital Capability in one platform',
    items: [
      { icon: Brain, color: 'bg-violet-100 text-violet-600', title: 'AI-Generated Reports', desc: 'Every learner gets an automated, ACSF-mapped report drafted by AI and reviewed by your trainers. No manual report writing.' },
      { icon: Target, color: 'bg-blue-100 text-blue-600', title: 'ACSF Mapped Assessments', desc: 'Every question is precisely mapped to an ACSF skill and performance level. Compliance evidence is generated automatically.' },
      { icon: Monitor, color: 'bg-teal-100 text-teal-600', title: 'Digital Capability Assessments', desc: 'Assess the digital skills of your learners alongside LLN. Everything in one platform, one invoice, one dashboard.' },
      { icon: Package, color: 'bg-emerald-100 text-emerald-600', title: 'Combined LLN + Digital', desc: 'Run both assessment types together. On our LLN + Digital plan, the same learner counts once — never billed twice.' },
    ],
  },
  {
    tag: 'Learner Experience',
    heading: 'Assessments learners actually complete',
    items: [
      { icon: Clock, color: 'bg-amber-100 text-amber-600', title: 'Fast 20-Minute Assessments', desc: 'Modern, engaging assessments designed to take under 20 minutes. Completion rates of 95%+ compared to 40% for traditional platforms.' },
      { icon: Users, color: 'bg-indigo-100 text-indigo-600', title: 'Any Device, Any Time', desc: 'Fully mobile-optimised. Learners can complete assessments on their phone, tablet, or desktop without any app download.' },
    ],
  },
  {
    tag: 'Trainer Workflow',
    heading: 'Powerful tools for your training team',
    items: [
      { icon: AlertTriangle, color: 'bg-rose-100 text-rose-600', title: 'Intervention Workflows', desc: 'At-risk learners are automatically flagged. Trainers have a structured workflow to manage, document, and close interventions.' },
      { icon: ClipboardList, color: 'bg-sky-100 text-sky-600', title: 'AI Support Plans', desc: 'Support plans are AI-drafted with personalised recommendations for each learner. Trainers review, edit, and approve before sending.' },
      { icon: Users, color: 'bg-blue-100 text-blue-600', title: 'Unlimited Trainers', desc: 'Add as many trainers as you need. There are no per-seat charges — every member of your training team can have full access.' },
      { icon: Building2, color: 'bg-orange-100 text-orange-600', title: 'Unlimited Campuses', desc: 'Manage multiple campuses, delivery modes, and teams from one central admin dashboard with full visibility.' },
    ],
  },
  {
    tag: 'Compliance & Reporting',
    heading: 'Built for ASQA audits',
    items: [
      { icon: ShieldCheck, color: 'bg-green-100 text-green-600', title: 'Audit-Ready Evidence', desc: 'Every assessment generates a complete, ASQA-compliant evidence trail. Assessment responses, dates, scores, and trainer decisions are all captured.' },
      { icon: Zap, color: 'bg-yellow-100 text-yellow-600', title: 'Instant Compliance Reports', desc: 'Download LLN compliance reports for any candidate, cohort, or qualification in seconds. No spreadsheets required.' },
    ],
  },
  {
    tag: 'Billing',
    heading: 'Pricing that scales with your RTO',
    items: [
      { icon: DollarSign, color: 'bg-lime-100 text-lime-600', title: 'Usage-Based Pricing', desc: 'You only pay for learners who complete assessments. Invitations, incomplete responses, and admin users are free.' },
      { icon: Zap, color: 'bg-primary-100 text-primary-600', title: 'No Contract Required', desc: 'Start a free trial with no credit card. Cancel or change plans anytime from your billing dashboard.' },
    ],
  },
];

export function FeaturesPage({ currentHash }: { currentHash: string }) {
  return (
    <div className="min-h-screen bg-white">
      <TopNav currentHash={currentHash} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white pt-28 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-4">Platform Features</p>
          <h1 className="text-5xl font-extrabold text-slate-900 leading-tight mb-5">
            Everything your RTO needs.<br />Nothing it doesn't.
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto mb-8">
            LLND Automate is purpose-built for Australian RTOs — every feature has a reason, and nothing is bloatware.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button onClick={() => nav('#/signup')} className="inline-flex items-center gap-2 px-7 py-3.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all shadow-md">
              Start Free Trial <ArrowRight className="w-5 h-5" />
            </button>
            <button onClick={() => nav('#/contact')} className="inline-flex items-center gap-2 px-7 py-3.5 border-2 border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-all">
              <Calendar className="w-5 h-5" /> Book a Demo
            </button>
          </div>
        </div>
      </section>

      {/* Feature sections */}
      {SECTIONS.map((section, si) => (
        <section key={si} className={`py-20 px-4 ${si % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
          <div className="max-w-6xl mx-auto">
            <p className="text-xs font-bold text-primary-600 uppercase tracking-widest mb-2">{section.tag}</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-10">{section.heading}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {section.items.map(({ icon: Icon, color, title, desc }) => (
                <div key={title} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color} mb-4`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-primary-700 to-primary-900 text-white text-center px-4">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-4">Ready to see it in action?</h2>
          <p className="text-primary-200 mb-8">Start your 14-day free trial or book a demo with our team.</p>
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
