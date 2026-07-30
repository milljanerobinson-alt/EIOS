import { ArrowRight, BookOpen, FileText, Video, HelpCircle, ExternalLink } from 'lucide-react';
import { TopNav } from '../../components/marketing/TopNav';
import { Footer } from '../../components/marketing/Footer';

function nav(hash: string) { window.location.href = hash; }

const ARTICLES = [
  { tag: 'Guide', title: 'Understanding ACSF Levels for RTOs', desc: 'A practical guide to the Australian Core Skills Framework and how it applies to your pre-enrolment LLN assessment obligations.', icon: BookOpen, color: 'bg-blue-100 text-blue-600' },
  { tag: 'Guide', title: 'ASQA LLN Requirements Explained', desc: 'What ASQA Standard 1.2 requires from RTOs, how to document evidence, and how to prepare for an audit.', icon: FileText, color: 'bg-emerald-100 text-emerald-600' },
  { tag: 'Tutorial', title: 'Setting Up Your First Assessment', desc: 'Step-by-step guide to creating your first LLN assessment, inviting learners, and reviewing results in LLND Automate.', icon: Video, color: 'bg-violet-100 text-violet-600' },
  { tag: 'Guide', title: 'Using AI Reports Effectively', desc: 'How to review, edit, and approve AI-generated support plans. Best practices for trainer approval workflows.', icon: FileText, color: 'bg-amber-100 text-amber-600' },
  { tag: 'Guide', title: 'Managing Learner Interventions', desc: 'How to use the intervention workflow to track at-risk learners, document decisions, and close cases.', icon: HelpCircle, color: 'bg-rose-100 text-rose-600' },
  { tag: 'Reference', title: 'ACSF Skill & Performance Level Reference', desc: 'Quick reference guide for all five ACSF core skill areas and their five performance levels.', icon: BookOpen, color: 'bg-teal-100 text-teal-600' },
];

export function ResourcesPage({ currentHash }: { currentHash: string }) {
  return (
    <div className="min-h-screen bg-white">
      <TopNav currentHash={currentHash} />

      <section className="bg-gradient-to-b from-primary-50 to-white pt-28 pb-14 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <p className="text-sm font-bold text-primary-600 uppercase tracking-widest mb-3">Resources</p>
          <h1 className="text-5xl font-extrabold text-slate-900 mb-4">Guides & Documentation</h1>
          <p className="text-lg text-slate-500">Practical guides for Australian RTOs on LLN compliance, ACSF assessment, and getting the most from LLND Automate.</p>
        </div>
      </section>

      <section className="py-16 px-4 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {ARTICLES.map(({ tag, title, desc, icon: Icon, color }) => (
            <div key={title} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
              <div className="flex items-start justify-between mb-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-primary-400 transition-colors" />
              </div>
              <span className="text-xs font-bold text-primary-600 uppercase tracking-wide">{tag}</span>
              <h3 className="font-bold text-slate-900 mt-1 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Help centre */}
        <div className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl p-10 text-white text-center">
          <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <HelpCircle className="w-7 h-7" />
          </div>
          <h2 className="text-3xl font-extrabold mb-3">Help Centre</h2>
          <p className="text-primary-200 mb-6 max-w-lg mx-auto">
            Have a specific question about the platform? Our help centre has step-by-step guides, video tutorials, and FAQs.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <button onClick={() => nav('#/contact')} className="px-6 py-3 bg-white text-primary-700 font-bold rounded-xl hover:bg-primary-50 transition-all inline-flex items-center gap-2">
              Contact Support <ArrowRight className="w-5 h-5" />
            </button>
            <button onClick={() => nav('#/signup')} className="px-6 py-3 border-2 border-white/30 text-white font-bold rounded-xl hover:bg-white/10 transition-all">
              Start Free Trial
            </button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
