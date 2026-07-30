import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './lib/auth';
import {
  useWorkspaceAccess, getLastWorkspace, getLastPage,
  setLastWorkspace, setLastPage, workspaceHash,
  type AnyWorkspace, type CustomerWorkspace,
} from './lib/workspaceAccess';
import { parseEngineeringRoute } from './lib/engineeringNavigationService';
import { ErrorBoundary, FeatureErrorBoundary } from './components/ErrorBoundary';
import { RouteLoadingState } from './components/RouteRecoveryStates';
import {
  resolveProduct, navigateInProduct, migrateLegacyLlnPaths,
  isEiosRoute, isLlndRoute, type Product,
} from './lib/productContext';

// Layouts
import { AdminLayout, type AdminPage } from './components/AdminLayout';
import { CustomerWorkspaceLayout } from './components/CustomerWorkspaceLayout';
import { EngineeringLayout } from './components/EngineeringLayout';

// Marketing
import { HomePage } from './pages/marketing/HomePage';
import { AboutPage } from './pages/marketing/AboutPage';
import { FeaturesPage } from './pages/marketing/FeaturesPage';
import { HowItWorksPage } from './pages/marketing/HowItWorksPage';
import { ResourcesPage } from './pages/marketing/ResourcesPage';
import { ContactPage } from './pages/marketing/ContactPage';

// Auth + public
import { SignUpPage } from './pages/SignUpPage';
import { PricingPage } from './pages/PricingPage';

// Assessment workspace pages
import { DashboardPage } from './pages/DashboardPage';
import { AssessmentsPage } from './pages/AssessmentsPage';
import { QualificationsPage } from './pages/QualificationsPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { ResultsPage } from './pages/ResultsPage';
import { SupportPlansPage } from './pages/SupportPlansPage';
import { InterventionsPage } from './pages/InterventionsPage';
import { CompliancePage } from './pages/CompliancePage';
import { ACSFEvidencePage } from './pages/ACSFEvidencePage';
import { AuditLogPage } from './pages/AuditLogPage';
import { EmailActivityPage } from './pages/EmailActivityPage';
import { AxcelerateLogPage } from './pages/AxcelerateLogPage';
import { AxcelerateInboundPage } from './pages/AxcelerateInboundPage';
import { ValidationPage } from './pages/ValidationPage';
import { BillingPage } from './pages/BillingPage';
import { SettingsPage } from './pages/SettingsPage';

// Trainer + Platform workspace dashboards
import { TrainerDashboardPage } from './pages/workspace/TrainerDashboardPage';
import { PlatformDashboardPage } from './pages/workspace/PlatformDashboardPage';

// Engineering
import { EngineeringControlCentrePage } from './pages/EngineeringControlCentrePage';

// Public token routes
import { LLNAssessmentPage } from './pages/LLNAssessmentPage';
import { DigitalAssessmentPage } from './pages/DigitalAssessmentPage';
import { QuizPage } from './pages/QuizPage';
import { StudentLandingPage } from './pages/StudentLandingPage';
import OAuthConsentPage from './pages/OAuthConsentPage';
import { LoginPage, type LoginContext } from './pages/LoginPage';

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary routeKey="global" componentName="App">
        <Router />
      </ErrorBoundary>
    </AuthProvider>
  );
}

function Router() {
  const { user, profile, loading, otpVerified } = useAuth();
  const { hasWorkspace, loading: wsLoading } = useWorkspaceAccess();

  // ─── Product context resolution (synchronous, before first render) ──────────
  // Resolves product from pathname, migrates legacy /lln -> /llnd,
  // and normalises OAuth consent path-based redirects.
  const product = resolveProduct();

  // Migrate any persisted /lln values in storage (once)
  useEffect(() => { migrateLegacyLlnPaths(); }, []);

  // ─── Path-to-hash redirect for OAuth consent (synchronous) ─────────────────
  // Supabase Auth redirects to /oauth/consent?authorization_id=xxx (path-based).
  // The SPA uses hash-based routing, so we normalise to #/oauth/consent?...
  // This must happen BEFORE the first render to avoid duplicate route display.
  if (typeof window !== 'undefined' && product === 'eios') {
    const path = window.location.pathname;
    const search = window.location.search;
    const existingHash = window.location.hash;
    if (path === '/oauth/consent' && search) {
      const authId = new URLSearchParams(search).get('authorization_id');
      if (authId && !existingHash.includes('oauth/consent')) {
        const newHash = `#/oauth/consent?authorization_id=${encodeURIComponent(authId)}`;
        history.replaceState(null, '', newHash);
      }
    } else if (path === '/oauth/consent' && !existingHash.includes('oauth/consent')) {
      history.replaceState(null, '', '#/oauth/consent');
    }
  }

  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const onHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // While auth or workspace access is loading, show loader — do not redirect.
  if (loading || (user && wsLoading)) return <FullScreenLoader />;

  const route = parseHash(hash);

  // ─── Product boundary enforcement ──────────────────────────────────────────
  // EIOS routes must never load under /llnd; LLND routes must never load under /.
  if (product === 'llnd' && isEiosRoute(hash) && route.kind !== 'root' && route.kind !== 'llnd-login') {
    // An EIOS route under /llnd — reject to LLND fallback
    navigateInProduct('llnd', '#/assessment/dashboard');
    return <FullScreenLoader />;
  }
  if (product === 'eios' && isLlndRoute(hash) && route.kind !== 'root') {
    // An LLND route under EIOS root — redirect to /llnd preserving the hash
    navigateInProduct('llnd', hash);
    return <FullScreenLoader />;
  }

  // ─── Public token routes (no auth, LLND product only) ───────────────────────
  if (route.kind === 'lln' && route.token)      return <LLNAssessmentPage token={route.token} />;
  if (route.kind === 'digital' && route.token)  return <DigitalAssessmentPage token={route.token} />;
  if (route.kind === 'quiz' && route.token)     return <QuizPage token={route.token} />;
  if (route.kind === 'student' && route.token)  return <StudentLandingPage token={route.token} />;

  // ─── OAuth consent route (handles auth internally, EIOS only) ────────────────
  if (route.kind === 'oauth-consent') return <OAuthConsentPage />;

  // ─── EIOS root route ──────────────────────────────────────────────────────────
  // EIOS root (#/) enters the EIOS authentication flow.
  // Signed-out -> #/login. Signed-in -> authorised EIOS workspace.
  // Must NEVER redirect to an LLND workspace (assessment/trainer).
  if (route.kind === 'root' && product === 'eios') {
    if (!user || !otpVerified) {
      redirect('#/login');
      return <FullScreenLoader />;
    }
    // Signed-in: restore valid authorised EIOS workspace
    // EIOS workspaces are 'engineering' and 'platform_admin' only.
    // 'assessment' and 'trainer' are LLND product workspaces.
    const ws = getLastWorkspace();
    const page = getLastPage(ws);
    const eiosWs = resolveEiosWorkspace(ws, profile, hasWorkspace);
    redirect(workspaceHash(eiosWs, eiosWs === 'engineering' ? page : getLastPage(eiosWs)));
    return <FullScreenLoader />;
  }

  // ─── LLND root route ─────────────────────────────────────────────────────────
  // LLND root (/llnd#/) enters the LLND Automate application flow.
  if (route.kind === 'root' && product === 'llnd') {
    if (!user || !otpVerified) {
      redirect('#/llnd-automate/login');
      return <FullScreenLoader />;
    }
    // Signed-in: route to LLND assessment dashboard or saved LLND workspace
    const ws = getLastWorkspace() as CustomerWorkspace;
    if (ws === 'assessment' || ws === 'trainer' || ws === 'platform_admin') {
      redirect(workspaceHash(ws, getLastPage(ws)));
    } else {
      redirect(workspaceHash('assessment', 'dashboard'));
    }
    return <FullScreenLoader />;
  }

  // ─── EIOS marketing pages (EIOS product only) ───────────────────────────────
  if (product === 'eios' && (route.kind === 'home' || route.kind === 'about' || route.kind === 'features' ||
      route.kind === 'how-it-works' || route.kind === 'resources' || route.kind === 'contact' ||
      route.kind === 'pricing' || route.kind === 'signup')) {
    if (route.kind === 'home')          return <HomePage currentHash={hash} />;
    if (route.kind === 'about')          return <AboutPage currentHash={hash} />;
    if (route.kind === 'features')       return <FeaturesPage currentHash={hash} />;
    if (route.kind === 'how-it-works')   return <HowItWorksPage currentHash={hash} />;
    if (route.kind === 'resources')      return <ResourcesPage currentHash={hash} />;
    if (route.kind === 'contact')        return <ContactPage currentHash={hash} />;
    if (route.kind === 'pricing')        return <PricingPage currentHash={hash} />;
    if (route.kind === 'signup')         return <SignUpPage />;
  }

  // ─── Login ──────────────────────────────────────────────────────────────────
  // #/login is the canonical EIOS platform login.
  // #/llnd-automate/login is the canonical LLND Automate product login.
  // OAuth continuation is detected via redirect param pointing to oauth/consent.
  if (route.kind === 'login' || route.kind === 'llnd-login' || route.kind === 'forgot-password') {
    if (user && otpVerified) {
      const redirectParam = parseRedirectParam(hash);
      if (redirectParam && isSafeRedirect(redirectParam)) {
        redirect(redirectParam);
        return <FullScreenLoader />;
      }
      // Post-login redirect respects product context
      if (product === 'llnd') {
        redirect(workspaceHash('assessment', 'dashboard'));
      } else {
        // EIOS product: never redirect to LLND workspaces (assessment/trainer)
        const eiosWs = resolveEiosWorkspace(getLastWorkspace(), profile, hasWorkspace);
        redirect(workspaceHash(eiosWs, getLastPage(eiosWs)));
      }
      return <FullScreenLoader />;
    }
    let loginCtx: LoginContext;
    if (route.kind === 'llnd-login') {
      loginCtx = 'llnd-automate';
    } else if (isOAuthLoginContext(hash)) {
      loginCtx = 'eios-oauth';
    } else {
      loginCtx = product === 'llnd' ? 'llnd-automate' : 'eios';
    }
    const oauthRedirect = parseRedirectParam(hash);
    return <LoginPage loginContext={loginCtx} oauthRedirect={oauthRedirect ?? undefined} />;
  }

  // ─── Auth gate for protected workspaces ─────────────────────────────────────
  if (!user || !otpVerified) {
    // OAuth consent → EIOS login with continuation
    if (route.kind === 'oauth-consent') {
      const consentHash = hash.startsWith('#') ? hash : `#${hash}`;
      redirect(`#/login?redirect=${encodeURIComponent(consentHash)}`);
      return <FullScreenLoader />;
    }
    // LLND Automate product routes → LLND Automate login
    if (route.kind === 'assessment' || route.kind === 'trainer') {
      redirect('#/llnd-automate/login');
      return <FullScreenLoader />;
    }
    // All other protected routes (engineering, platform admin, etc.) → EIOS login
    redirect('#/login');
    return <FullScreenLoader />;
  }

  // ─── Engineering workspace (EIOS product only) ──────────────────────────────
  if (route.kind === 'engineering') {
    if (product === 'llnd') {
      // Engineering route under /llnd — reject to LLND fallback
      navigateInProduct('llnd', '#/assessment/dashboard');
      return <FullScreenLoader />;
    }
    if (profile?.role !== 'admin') {
      redirect(workspaceHash(primaryWorkspaceFor(profile), 'dashboard'));
      return <FullScreenLoader />;
    }
    setLastWorkspace('engineering');
    setLastPage('engineering', route.section);
    return (
      <EngineeringLayout>
        <FeatureErrorBoundary featureName="Engineering" routeKey={`engineering.${route.section}`}>
          <EngineeringControlCentrePage
            initialPage={route.section as any}
            objectRef={route.objectRef ?? undefined}
            subPath={route.subPath ?? undefined}
          />
        </FeatureErrorBoundary>
      </EngineeringLayout>
    );
  }

  // ─── Assessment workspace (LLND product only) ───────────────────────────────
  if (route.kind === 'assessment') {
    if (product === 'eios') {
      // Assessment route under EIOS root — redirect to /llnd
      navigateInProduct('llnd', hash);
      return <FullScreenLoader />;
    }
    if (!hasWorkspace('assessment')) {
      redirect(workspaceHash(primaryWorkspaceFor(profile), 'dashboard'));
      return <FullScreenLoader />;
    }
    setLastWorkspace('assessment');
    setLastPage('assessment', route.page);
    return (
      <AdminLayout currentPage={route.page as AdminPage} onPageChange={(p) => redirect(workspaceHash('assessment', p))}>
        <FeatureErrorBoundary featureName="Assessment" routeKey={`assessment.${route.page}`}>
          {renderAssessmentPage(route.page)}
        </FeatureErrorBoundary>
      </AdminLayout>
    );
  }

  // ─── Trainer workspace (LLND product only) ──────────────────────────────────
  if (route.kind === 'trainer') {
    if (product === 'eios') {
      navigateInProduct('llnd', hash);
      return <FullScreenLoader />;
    }
    if (!hasWorkspace('trainer')) {
      redirect(workspaceHash(primaryWorkspaceFor(profile), 'dashboard'));
      return <FullScreenLoader />;
    }
    setLastWorkspace('trainer');
    setLastPage('trainer', route.page);
    return (
      <CustomerWorkspaceLayout workspace="trainer" currentPage={route.page} onPageChange={(p) => redirect(workspaceHash('trainer', p))}>
        <FeatureErrorBoundary featureName="Trainer" routeKey={`trainer.${route.page}`}>
          {renderTrainerPage(route.page)}
        </FeatureErrorBoundary>
      </CustomerWorkspaceLayout>
    );
  }

  // ─── Platform admin workspace (EIOS product only) ───────────────────────────
  if (route.kind === 'platform') {
    if (product === 'llnd') {
      navigateInProduct('llnd', '#/assessment/dashboard');
      return <FullScreenLoader />;
    }
    if (!hasWorkspace('platform_admin')) {
      redirect(workspaceHash(primaryWorkspaceFor(profile), 'dashboard'));
      return <FullScreenLoader />;
    }
    setLastWorkspace('platform_admin');
    setLastPage('platform_admin', route.page);
    return (
      <CustomerWorkspaceLayout workspace="platform_admin" currentPage={route.page} onPageChange={(p) => redirect(workspaceHash('platform_admin', p))}>
        <FeatureErrorBoundary featureName="Platform" routeKey={`platform.${route.page}`}>
          {renderPlatformPage(route.page)}
        </FeatureErrorBoundary>
      </CustomerWorkspaceLayout>
    );
  }

  // Fallback — redirect to product-appropriate default
  if (user && otpVerified) {
    if (product === 'llnd') {
      redirect(workspaceHash('assessment', 'dashboard'));
    } else {
      // EIOS product: never redirect to LLND workspaces
      const eiosWs = resolveEiosWorkspace(getLastWorkspace(), profile, hasWorkspace);
      redirect(workspaceHash(eiosWs, getLastPage(eiosWs)));
    }
  } else {
    redirect(product === 'llnd' ? '#/llnd-automate/login' : '#/login');
  }
  return <FullScreenLoader />;
}

// ─── OAuth Login Context & Redirect Safety (EWO-027R.1R) ─────────────────────

function parseRedirectParam(hash: string): string | null {
  const queryPart = hash.split('?')[1];
  if (!queryPart) return null;
  const params = new URLSearchParams(queryPart);
  return params.get('redirect');
}

function isOAuthLoginContext(hash: string): boolean {
  const redirect = parseRedirectParam(hash);
  if (!redirect) return false;
  return redirect.includes('oauth/consent');
}

// Only allow internal hash-based redirects to prevent open redirect attacks.
const SAFE_REDIRECT_PREFIXES = ['#/oauth/consent', '#/engineering', '#/platform', '#/assessment', '#/trainer'];

function isSafeRedirect(redirect: string): boolean {
  if (!redirect.startsWith('#/')) return false;
  return SAFE_REDIRECT_PREFIXES.some((prefix) => redirect.startsWith(prefix));
}

// ─── Hash parser ──────────────────────────────────────────────────────────────

type Route =
  | { kind: 'root' }
  | { kind: 'home' }
  | { kind: 'about' }
  | { kind: 'features' }
  | { kind: 'how-it-works' }
  | { kind: 'resources' }
  | { kind: 'contact' }
  | { kind: 'pricing' }
  | { kind: 'login' }
  | { kind: 'forgot-password' }
  | { kind: 'signup' }
  | { kind: 'lln'; token: string }
  | { kind: 'digital'; token: string }
  | { kind: 'quiz'; token: string }
  | { kind: 'student'; token: string }
  | { kind: 'engineering'; section: string; objectRef: string | null; subPath: string | null }
  | { kind: 'assessment'; page: string }
  | { kind: 'trainer'; page: string }
  | { kind: 'platform'; page: string }
  | { kind: 'llnd-login' }
  | { kind: 'oauth-consent' };

function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, '').split('?')[0];

  if (!h || h === '') return { kind: 'root' };

  const parts = h.split('/');

  if (parts[0] === 'home')           return { kind: 'home' };
  if (parts[0] === 'about')          return { kind: 'about' };
  if (parts[0] === 'features')      return { kind: 'features' };
  if (parts[0] === 'how-it-works')  return { kind: 'how-it-works' };
  if (parts[0] === 'resources')     return { kind: 'resources' };
  if (parts[0] === 'contact')       return { kind: 'contact' };
  if (parts[0] === 'pricing')       return { kind: 'pricing' };
  if (parts[0] === 'login')         return { kind: 'login' };
  if (parts[0] === 'forgot-password') return { kind: 'forgot-password' };
  if (parts[0] === 'signup')        return { kind: 'signup' };
  if (parts[0] === 'llnd-automate' && parts[1] === 'login') return { kind: 'llnd-login' };

  if (parts[0] === 'lln' && parts[1])     return { kind: 'lln', token: parts[1] };
  if (parts[0] === 'digital' && parts[1]) return { kind: 'digital', token: parts[1] };
  if (parts[0] === 'quiz' && parts[1])    return { kind: 'quiz', token: parts[1] };
  if (parts[0] === 'student' && parts[1]) return { kind: 'student', token: parts[1] };

  if (parts[0] === 'engineering') {
    const parsed = parseEngineeringRoute(hash);
    return { kind: 'engineering', section: parsed.section, objectRef: parsed.objectRef, subPath: parsed.subPath };
  }

  if (parts[0] === 'oauth' && parts[1] === 'consent') return { kind: 'oauth-consent' };

  if (parts[0] === 'assessment' && parts[1]) return { kind: 'assessment', page: parts[1] };
  if (parts[0] === 'trainer' && parts[1])    return { kind: 'trainer', page: parts[1] };
  if (parts[0] === 'platform' && parts[1])   return { kind: 'platform', page: parts[1] };

  return { kind: 'root' };
}

// ─── Page renderers ────────────────────────────────────────────────────────────

function renderAssessmentPage(page: string) {
  switch (page) {
    case 'dashboard':         return <DashboardPage />;
    case 'assessments':       return <AssessmentsPage />;
    case 'qualifications':    return <QualificationsPage />;
    case 'candidates':        return <CandidatesPage />;
    case 'results':           return <ResultsPage />;
    case 'support-plans':     return <SupportPlansPage />;
    case 'interventions':     return <InterventionsPage />;
    case 'compliance':        return <CompliancePage />;
    case 'acsf-evidence':     return <ACSFEvidencePage />;
    case 'audit-log':         return <AuditLogPage />;
    case 'email-activity':    return <EmailActivityPage />;
    case 'axcelerate-log':    return <AxcelerateLogPage />;
    case 'axcelerate-inbound': return <AxcelerateInboundPage />;
    case 'validation':       return <ValidationPage />;
    case 'billing':           return <BillingPage />;
    case 'settings':          return <SettingsPage />;
    default:                  return <DashboardPage />;
  }
}

function renderTrainerPage(page: string) {
  switch (page) {
    case 'dashboard':        return <TrainerDashboardPage />;
    case 'students':         return <TrainerDashboardPage />;
    case 'awaiting-review':  return <TrainerDashboardPage />;
    case 'support-plans':    return <SupportPlansPage />;
    case 'interventions':    return <InterventionsPage />;
    case 'results':          return <ResultsPage />;
    case 'evidence':         return <ResultsPage />;
    default:                 return <TrainerDashboardPage />;
  }
}

function renderPlatformPage(page: string) {
  switch (page) {
    case 'dashboard':         return <PlatformDashboardPage />;
    case 'settings':          return <SettingsPage />;
    case 'users':             return <SettingsPage />;
    case 'billing':           return <BillingPage />;
    case 'axcelerate-inbound': return <AxcelerateInboundPage />;
    case 'axcelerate-log':    return <AxcelerateLogPage />;
    case 'email-activity':    return <EmailActivityPage />;
    case 'validation':       return <ValidationPage />;
    case 'ai-providers':      return <SettingsPage />;
    case 'feature-flags':     return <SettingsPage />;
    case 'system-health':     return <PlatformDashboardPage />;
    default:                  return <PlatformDashboardPage />;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function redirect(hash: string) {
  if (window.location.hash !== hash) window.location.hash = hash;
}

function primaryWorkspaceFor(profile: { role?: string } | null): CustomerWorkspace {
  if (profile?.role === 'trainer') return 'trainer';
  return 'assessment';
}

/**
 * Resolves the EIOS workspace for a signed-in user.
 * EIOS workspaces are 'engineering' (admin only) and 'platform_admin'.
 * LLND workspaces ('assessment', 'trainer') are never returned from EIOS context.
 * If the stored workspace is an LLND workspace or access is denied, falls back
 * to 'engineering' for admins or 'platform_admin' for non-admins.
 */
function resolveEiosWorkspace(
  stored: AnyWorkspace,
  profile: { role?: string } | null,
  hasWorkspace: (ws: CustomerWorkspace) => boolean,
): AnyWorkspace {
  // Admin: engineering is the EIOS admin workspace
  if (profile?.role === 'admin') {
    if (stored === 'engineering') return 'engineering';
    // Stored workspace might be an LLND workspace — fall back to engineering
    return 'engineering';
  }
  // Non-admin: platform_admin is the only EIOS non-admin workspace
  if (hasWorkspace('platform_admin')) return 'platform_admin';
  // No EIOS workspace access — fall back to platform_admin as the safest EIOS route
  return 'platform_admin';
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center animate-pulse">
          <span className="text-white font-bold text-sm">L</span>
        </div>
        <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );
}
