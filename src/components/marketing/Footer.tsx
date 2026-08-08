import { GraduationCap, Mail, ArrowRight } from 'lucide-react';

export function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z"/>
    </svg>
  );
}

const COLS = [
  {
    heading: 'Product',
    links: [
      { label: 'Features', hash: '#/features' },
      { label: 'Pricing', hash: '#/pricing' },
      { label: 'How It Works', hash: '#/how-it-works' },
      { label: 'Security', hash: '#/about' },
      { label: 'Changelog', hash: '#/resources' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'About', hash: '#/about' },
      { label: 'Contact', hash: '#/contact' },
      { label: 'Blog', hash: '#/resources' },
      { label: 'Careers', hash: '#/about' },
    ],
  },
  {
    heading: 'Resources',
    links: [
      { label: 'Documentation', hash: '#/resources' },
      { label: 'Help Centre', hash: '#/resources' },
      { label: 'API Reference', hash: '#/resources' },
      { label: 'Status', hash: '#/resources' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy Policy', hash: '#/privacy' },
      { label: 'Terms of Service', hash: '#/terms' },
      { label: 'Data Processing', hash: '#/privacy' },
    ],
  },
];

function nav(hash: string) {
  window.location.href = hash;
}

export function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-400">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-10">
        {/* Top section */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 mb-12">
          {/* Brand col */}
          <div className="col-span-2">
            <button onClick={() => nav('#/')} className="flex items-center gap-2.5 mb-5 group">
              <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center group-hover:bg-primary-500 transition-colors">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
              <span className="text-white font-extrabold text-lg tracking-tight">LLND Automate</span>
            </button>
            <p className="text-sm leading-relaxed mb-6 max-w-xs">
              LLND Automate — modern LLN & Digital Capability assessments built specifically for Australian RTOs. Simple compliance technology that just works.
            </p>
            <div className="flex gap-2">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noreferrer"
                className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-slate-700 transition-colors"
                aria-label="LinkedIn"
              >
                <LinkedinIcon className="w-4 h-4" />
              </a>
              <a
                href="mailto:hello@llnd.com.au"
                className="w-9 h-9 bg-slate-800 rounded-lg flex items-center justify-center hover:bg-slate-700 transition-colors"
                aria-label="Email"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Link columns */}
          {COLS.map((col) => (
            <div key={col.heading}>
              <h4 className="text-white text-sm font-semibold mb-4 tracking-wide">{col.heading}</h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={() => nav(link.hash)}
                      className="text-sm hover:text-white transition-colors text-left"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Newsletter strip */}
        <div className="border-t border-slate-800 py-8 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-white font-semibold text-sm">Stay up to date</p>
              <p className="text-slate-500 text-xs mt-0.5">Product updates, RTO compliance tips, and more.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <input
                type="email"
                placeholder="you@rto.edu.au"
                className="flex-1 sm:w-56 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 transition-colors"
              />
              <button className="px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-500 transition-colors flex-shrink-0 flex items-center gap-1.5">
                Subscribe <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} LLND Automate. All rights reserved.
          </p>
          <div className="flex items-center gap-5 text-xs">
            <button onClick={() => nav('#/llnd-automate/login')} className="hover:text-white transition-colors">
              Sign In
            </button>
            <button
              onClick={() => nav('#/signup')}
              className="bg-primary-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-primary-500 transition-colors flex items-center gap-1.5"
            >
              Start Free Trial <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
