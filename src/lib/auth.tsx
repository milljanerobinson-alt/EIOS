import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';
import { logAudit } from './audit';
import { productBaseUrl, resolveProduct } from './productContext';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isRecovery: boolean;
  otpVerified: boolean;
  markOtpVerified: () => void;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
}

const OTP_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function otpStorageKey(userId: string) {
  return `ax_otp_verified_${userId}`;
}

function isOtpStoredValid(userId: string): boolean {
  try {
    const raw = localStorage.getItem(otpStorageKey(userId));
    if (!raw) return false;
    const { expires } = JSON.parse(raw);
    return typeof expires === 'number' && Date.now() < expires;
  } catch {
    return false;
  }
}

function storeOtpVerified(userId: string) {
  localStorage.setItem(otpStorageKey(userId), JSON.stringify({ expires: Date.now() + OTP_TTL_MS }));
}

function clearOtpVerified(userId: string) {
  localStorage.removeItem(otpStorageKey(userId));
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);

  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setIsRecovery(true);
      window.history.replaceState(null, '', window.location.pathname);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecovery(true);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
        logAudit({ event_type: 'auth.password_reset_requested', category: 'authentication', description: 'Password reset requested', source: 'admin', actor_id: session?.user?.id ?? null });
        return;
      }
      if (event === 'USER_UPDATED') {
        setIsRecovery(false);
      }
      if (event === 'SIGNED_IN' && session?.user) {
        logAudit({ event_type: 'auth.login', category: 'authentication', description: `Admin login — ${session.user.email}`, source: 'admin', actor_id: session.user.id });
      }
      if (event === 'SIGNED_OUT') {
        logAudit({ event_type: 'auth.logout', category: 'authentication', description: 'Admin signed out', source: 'admin' });
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        if (isOtpStoredValid(session.user.id)) {
          setOtpVerified(true);
        }
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setOtpVerified(false);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        setLoading(false);
        return;
      }
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        if (isOtpStoredValid(session.user.id)) {
          setOtpVerified(true);
        }
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data as Profile | null);
    if (data?.otp_disabled) {
      setOtpVerified(true);
      storeOtpVerified(userId);
    }
    setLoading(false);
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: productBaseUrl(resolveProduct()) },
    });
  }

  async function signInWithApple() {
    await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: productBaseUrl(resolveProduct()) },
    });
  }

  async function signOut() {
    if (user) clearOtpVerified(user.id);
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
    setOtpVerified(false);
    window.location.hash = '#/';
  }

  function markOtpVerified() {
    if (user) storeOtpVerified(user.id);
    setOtpVerified(true);
    logAudit({ event_type: 'auth.otp_verified', category: 'authentication', description: `OTP verification completed — ${user?.email}`, source: 'admin', actor_id: user?.id ?? null });
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, isRecovery, otpVerified, markOtpVerified, signInWithGoogle, signInWithApple, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
