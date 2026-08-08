import { useState, useEffect } from 'react';
import { GraduationCap, Menu, X, ChevronRight } from 'lucide-react';
import { useAuth } from '../../lib/auth';

const NAV_LINKS = [
  { label: 'Features', hash: '#/features' },
  { label: 'Pricing', hash: '#/pricing' },
  { label: 'How It Works', hash: '#/how-it-works' },
  { label: 'Resources', hash: '#/resources' },
  { label: 'About', hash: '#/about' },
  { label: 'Contact', hash: '#/contact' },
];

function nav(hash: string) {
  window.location.href = hash;
}

interface TopNavProps {
  currentHash: string;
}

export function TopNav({ currentHash }: TopNavProps) {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [currentHash]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled || mobileOpen
          ? 'bg-white/95 backdrop-blur-md shadow-sm border-b border-slate-100'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
        {/* Logo */}
        <button
          onClick={() => nav('#/home')}
          className="flex items-center gap-2.5 flex-shrink-0 group"
        >
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-primary-700 transition-colors">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-extrabold tracking-tight text-slate-900">
              LLND <span className="shimmer-text">Automate</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium hidden sm:block">Assessment Platform</span>
          </div>
        </button>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-0.5 flex-1 justify-center">
          {NAV_LINKS.map((link) => (
            <button
              key={link.hash}
              onClick={() => nav(link.hash)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentHash === link.hash
                  ? 'text-primary-600 bg-primary-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
          {user ? (
            <button
              onClick={() => nav('#/assessment/dashboard')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-all shadow-sm"
            >
              Open Dashboard <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <button
                onClick={() => nav('#/llnd-automate/login')}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => nav('#/signup')}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-all shadow-sm shadow-primary-200"
              >
                Start Free Trial
              </button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-t border-slate-100 px-4 pb-4">
          <nav className="flex flex-col gap-0.5 py-3">
            {NAV_LINKS.map((link) => (
              <button
                key={link.hash}
                onClick={() => nav(link.hash)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  currentHash === link.hash
                    ? 'text-primary-600 bg-primary-50'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>
          <div className="flex flex-col gap-2 pt-3 border-t border-slate-100">
            {user ? (
              <button
                onClick={() => nav('#/assessment/dashboard')}
                className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-bold text-center"
              >
                Open Dashboard
              </button>
            ) : (
              <>
                <button
                  onClick={() => nav('#/llnd-automate/login')}
                  className="w-full py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold text-center hover:bg-slate-50"
                >
                  Sign In
                </button>
                <button
                  onClick={() => nav('#/signup')}
                  className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-bold text-center"
                >
                  Start Free Trial — Free 14 days
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
