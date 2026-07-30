import { ArrowRight, Target, Users, ShieldCheck, Zap } from 'lucide-react';
import { TopNav } from '../../components/marketing/TopNav';
import { Footer } from '../../components/marketing/Footer';

function nav(hash: string) { window.location.href = hash; }

const VALUES = [
  { icon: Target, title: 'Purpose-built', desc: 'Built exclusively for Australian RTOs. We understand ACSF, ASQA, and the real challenges of managing LLN compliance.', color: 'bg-blue-100 text-blue-600' },
  { icon: Zap, title: 'Simple by default', desc: 'Compliance doesn\'t have to be complicated. We obsess over simplicity so your trainers can focus on learners, not software.', color: 'bg-amber-100 text-amber-600' },
  { icon: Users, title: 'Trainer-first', desc: 'Every feature is designed to save trainer time. Automated reports, approval workflows, and smart defaults throughout.', color: 'bg-teal-100 text-teal-600' },
  { icon: ShieldCheck, title: 'Compliance always', desc: 'ACSF mapping, ASQA-ready evidence trails, and audit-friendly reporting are not add-ons. They\'re the foundation.', color: 'bg-emerald-100 text-emerald-600' },
];

export function AboutPage({ currentHash }: { currentHash: string }) {
  return (
    <div className="min-h-screen bg-white">
      <TopNav currentHash={currentHash} />

      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white pt-28 pb-16 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-4">About LLND Automate</p>
          <h1 className="text-5xl font-extrabold text-slate-900 mb-5 leading-tight">
            Simple compliance technology<br />that just works.
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            LLND Automate was built by people who have spent years working with Australian RTOs. We saw trainers drowning in paperwork, struggling with legacy tools, and spending more time on administration than on learners.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 px-4 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Our Mission</p>
            <h2 className="text-3xl font-extrabold text-slate-900 mb-5">Make LLN compliance the easiest part of running an RTO</h2>
            <p className="text-slate-500 leading-relaxed mb-4">
              Australian RTOs are legally required to assess language, literacy and numeracy capabilities before enrolment. But the tools available to do this have barely changed in a decade.
            </p>
            <p className="text-slate-500 leading-relaxed mb-4">
              LLND Automate replaces legacy forms, Excel spreadsheets, and manual report-writing with a modern platform that handles everything — from learner invitations to ACSF-mapped AI reports — automatically.
            </p>
            <p className="text-slate-500 leading-relaxed">
              Our goal is simple: give every RTO in Australia access to world-class LLN assessment technology, at a price that scales with their actual usage.
            </p>
          </div>
          <div className="bg-gradient-to-br from-primary-50 to-accent-50 rounded-3xl p-12 text-center">
            <div className="text-5xl font-extrabold text-primary-600 mb-2">50+</div>
            <div className="text-slate-600 font-semibold mb-6">RTOs across Australia</div>
            <div className="text-4xl font-extrabold text-accent-600 mb-2">96%</div>
            <div className="text-slate-600 font-semibold mb-6">Average learner completion rate</div>
            <div className="text-4xl font-extrabold text-emerald-600 mb-2">20 min</div>
            <div className="text-slate-600 font-semibold">Average assessment completion time</div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-slate-50 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Our Values</p>
            <h2 className="text-3xl font-extrabold text-slate-900">What we believe</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {VALUES.map(({ icon: Icon, title, desc, color }) => (
              <div key={title} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} mb-4`}>
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-4">Join us</h2>
          <p className="text-slate-500 text-lg mb-8">Start your free trial today and see why RTOs across Australia are switching to LLND Automate.</p>
          <button onClick={() => nav('#/signup')} className="inline-flex items-center gap-2 px-8 py-4 bg-primary-600 text-white font-extrabold rounded-xl hover:bg-primary-700 shadow-lg transition-all">
            Start Free Trial <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
