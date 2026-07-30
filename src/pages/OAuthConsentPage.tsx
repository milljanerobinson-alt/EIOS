// EWO-027R.DCR — OAuth Consent UI
// Receives authorization_id from Supabase OAuth 2.1 Server, displays client info
// and requested scopes, allows the authenticated user to approve or deny.
// Uses supabase.auth.oauth.* API (available in @supabase/supabase-js v2.45.0+).

import { useState, useEffect, useCallback } from 'react';
import { Shield, CheckCircle2, XCircle, Loader2, AlertTriangle, ArrowLeft, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

interface AuthorizationDetails {
  authorization_id: string;
  client: {
    id: string;
    name?: string;
    icon_url?: string;
  };
  scope: string[] | string;
  redirect_uri: string;
}

interface OAuthRedirect {
  redirect_url: string;
}

type AuthorizationResponse = AuthorizationDetails | OAuthRedirect;

function isAuthorizationDetails(data: unknown): data is AuthorizationDetails {
  return typeof data === 'object' && data !== null && 'authorization_id' in data;
}

// ─── Scope Normalisation ─────────────────────────────────────────────────────
// The Supabase OAuth API may return scope as an array (['openid', 'profile'])
// or as a space-delimited string ('openid profile'). Normalise to a string
// array safely without discarding valid data.
function normaliseScopes(raw: unknown): { scopes: string[]; valid: boolean } {
  if (Array.isArray(raw)) {
    const scopes = raw.filter((s): s is string => typeof s === 'string' && s.length > 0);
    return { scopes, valid: scopes.length === raw.length };
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    const scopes = raw.trim().split(/\s+/).filter((s) => s.length > 0);
    return { scopes, valid: true };
  }
  if (typeof raw === 'string' && raw.trim().length === 0) {
    return { scopes: [], valid: true };
  }
  if (raw == null) {
    return { scopes: [], valid: true };
  }
  // Non-array, non-string, non-null — unsupported shape
  return { scopes: [], valid: false };
}

function getAuthorizationId(): string {
  // App.tsx converts path-based /oauth/consent?authorization_id=xxx to
  // hash-based #/oauth/consent?authorization_id=xxx. The authorization_id
  // may be in either location depending on timing.
  const hashParams = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const hashId = hashParams.get('authorization_id');
  if (hashId) return hashId;

  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get('authorization_id') ?? '';
}

export default function OAuthConsentPage() {
  const authorizationId = getAuthorizationId();
  const navigate = (path: string) => { window.location.hash = path; };
  const { session, profile } = useAuth();
  const [details, setDetails] = useState<AuthorizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<'approve' | 'deny' | null>(null);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const loadDetails = useCallback(async () => {
    if (!authorizationId) {
      setError('Missing authorization_id parameter. The authorization request may have expired or been accessed incorrectly.');
      setLoading(false);
      return;
    }

    if (!session) {
      // Preserve the full hash (including authorization_id) so that after
      // login the user returns to the exact same consent page.
      const currentHash = window.location.hash || '#/oauth/consent';
      const encodedRedirect = encodeURIComponent(currentHash);
      window.location.hash = `/login?redirect=${encodedRedirect}`;
      return;
    }

    try {
      const { data, error: detailsError } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

      if (detailsError) {
        const msg = detailsError.message || 'Failed to load authorization details.';
        setError(msg.includes('not found') || msg.includes('expired')
          ? 'Authorization request not found or expired. Please restart the authorization flow from the requesting application.'
          : `Failed to load authorization details: ${msg}`);
        setLoading(false);
        return;
      }

      if (!data) {
        setError('Authorization request not found or expired.');
        setLoading(false);
        return;
      }

      // If user already consented, redirect immediately
      if (!isAuthorizationDetails(data)) {
        const redirect = (data as OAuthRedirect).redirect_url;
        if (redirect) {
          window.location.assign(redirect);
          return;
        }
        setError('Authorization already processed but no redirect URL was provided.');
        setLoading(false);
        return;
      }

      const authDetails = data as AuthorizationDetails;
      const { scopes, valid } = normaliseScopes(authDetails.scope);
      if (!valid) {
        console.warn('[OAuthConsent] scope field has unsupported runtime type', {
          type: typeof authDetails.scope,
          isArray: Array.isArray(authDetails.scope),
        });
        setError('The authorization request contains unsupported data. Please restart the authorization flow from the requesting application.');
        setLoading(false);
        return;
      }
      setDetails({ ...authDetails, scope: scopes });
      setLoading(false);
    } catch {
      setError('Failed to load authorization details. Please try again or restart the authorization flow.');
      setLoading(false);
    }
  }, [authorizationId, session, navigate]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const recordConsentAudit = async (action: 'approved' | 'denied', clientId?: string, scopes?: string[]) => {
    try {
      await supabase.from('atd_connect_inspection_log').insert({
        request_id: `oauth-consent-${Date.now()}`,
        timestamp: new Date().toISOString(),
        requesting_persona: session?.user?.id ?? 'unknown',
        operation: `oauth_consent_${action}`,
        outcome: action,
        request_source: 'oauth_consent',
        client_id: clientId ?? null,
        tool_name: 'oauth_consent',
        original_request: JSON.stringify({
          authorization_id: authorizationId,
          client_id: clientId,
          client_name: details?.client?.name,
          requested_scopes: scopes,
          action,
        }),
      });
    } catch {
      // Best-effort audit logging
    }
  };

  const handleApprove = async () => {
    setActionInProgress('approve');
    try {
      const { data, error: approveError } = await supabase.auth.oauth.approveAuthorization(authorizationId, {
        skipBrowserRedirect: true,
      });

      if (approveError) {
        setError(approveError.message || 'Failed to approve authorization.');
        setActionInProgress(null);
        return;
      }

      await recordConsentAudit('approved', details?.client?.id, details?.scope);

      if (data?.redirect_url) {
        setRedirectUrl(data.redirect_url);
      } else {
        setError('Authorization approved but no redirect URL was returned.');
        setActionInProgress(null);
      }
    } catch {
      setError('Failed to approve authorization. Please try again.');
      setActionInProgress(null);
    }
  };

  const handleDeny = async () => {
    setActionInProgress('deny');
    try {
      const { data, error: denyError } = await supabase.auth.oauth.denyAuthorization(authorizationId, {
        skipBrowserRedirect: true,
      });

      if (denyError) {
        setError(denyError.message || 'Failed to deny authorization.');
        setActionInProgress(null);
        return;
      }

      await recordConsentAudit('denied', details?.client?.id, details?.scope);

      if (data?.redirect_url) {
        setRedirectUrl(data.redirect_url);
      } else {
        setError('Authorization denied but no redirect URL was returned.');
        setActionInProgress(null);
      }
    } catch {
      setError('Failed to deny authorization. Please try again.');
      setActionInProgress(null);
    }
  };

  // Redirect after approve/deny
  useEffect(() => {
    if (redirectUrl) {
      window.location.assign(redirectUrl);
    }
  }, [redirectUrl]);

  // ─── Loading State ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-600">Loading authorization request...</p>
        </div>
      </div>
    );
  }

  // ─── Error State ──────────────────────────────────────────────────────────────
  if (error && !details) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-slate-800">Authorization Error</h1>
              <p className="text-xs text-slate-500 mt-0.5">The authorization request could not be processed.</p>
            </div>
          </div>
          <p className="text-sm text-slate-600">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-eios-600 hover:text-eios-700 font-medium"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Return to dashboard
          </button>
        </div>
      </div>
    );
  }

  // ─── Consent Form ──────────────────────────────────────────────────────────────
  const scopeDescriptions: Record<string, string> = {
    openid: 'Verify your identity',
    profile: 'Access your profile information',
    email: 'Access your email address',
  };

  const clientName = details?.client?.name ?? details?.client?.id ?? 'An application';
  const userEmail = session?.user?.email ?? profile?.full_name ?? 'your account';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-eios-50/50 p-4">
      <div className="max-w-md w-full rounded-xl border border-slate-200 bg-white shadow-sm p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-eios-600 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-slate-800">Authorize Application</h1>
            <p className="text-xs text-slate-500 mt-0.5">ATD Connect — Engineering Inspection Platform</p>
          </div>
        </div>

        {/* Signed-in user indicator */}
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
          <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center">
            <User className="w-3.5 h-3.5 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{userEmail}</p>
            <p className="text-xs text-slate-400">Signed in to EIOS</p>
          </div>
        </div>

        {/* Client Info */}
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            <span className="font-medium">{clientName}</span>
            {' '}is requesting permission to access EIOS through ATD.
          </p>
          {details?.client?.icon_url && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-100">
              <img src={details.client.icon_url} alt="Client icon" className="w-8 h-8 rounded" />
              <span className="text-xs font-mono text-slate-600">{details.client.id}</span>
            </div>
          )}
        </div>

        {/* Requested Scopes */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-600">This application is requesting the following permissions:</p>
          <div className="space-y-1.5">
            {Array.isArray(details?.scope) ? details.scope.map(scope => (
              <div key={scope} className="flex items-start gap-2 p-2 rounded border border-slate-100">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-xs font-mono font-medium text-slate-700">{scope}</span>
                  <p className="text-xs text-slate-500">{scopeDescriptions[scope] ?? 'Access requested'}</p>
                </div>
              </div>
            )) : null}
          </div>
        </div>

        {/* Info Note */}
        <div className="p-2.5 rounded-lg bg-eios-50 border border-eios-100 text-xs text-eios-700">
          <Shield className="w-3.5 h-3.5 inline mr-1" />
          This application will only have read-only access to governed engineering inspection capabilities. All inspections are audited.
        </div>

        {/* Error (action-level) */}
        {error && details && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
            {error}
          </div>
        )}

        {/* Redirecting State */}
        {redirectUrl && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Redirecting...
          </div>
        )}

        {/* Actions */}
        {!redirectUrl && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleApprove}
              disabled={actionInProgress !== null}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-eios-600 text-white hover:bg-eios-700 transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Allow access
            </button>
            <button
              onClick={handleDeny}
              disabled={actionInProgress !== null}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-lg bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {actionInProgress === 'deny' ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Deny
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-xs text-slate-400 text-center">
          By allowing access, you permit this application to inspect governed engineering records on your behalf.
        </p>
      </div>
    </div>
  );
}
