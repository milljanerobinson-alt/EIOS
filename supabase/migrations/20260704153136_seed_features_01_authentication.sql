
-- ─────────────────────────────────────────────────────────────────────────────
-- SEED: Authentication & User Management
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ecc_product_features (
  feature_id, name, category, sub_category, description, purpose,
  status, priority, release_version, implementation_date,
  implementation_source, source_file, developer, testing_status, production_ready,
  database_changes, ui_changes, compliance_impact, audit_impact, security_impact,
  documentation_status, tags
) VALUES

('FEAT-001', 'Email / Password Authentication', 'Authentication', 'Login',
 'Standard Supabase email and password login flow for admin and trainer users.',
 'Secure access control for the admin portal.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/LoginPage.tsx', 'AI', 'requires_review', true,
 'profiles table, Supabase Auth built-in', 'LoginPage with email/password form and view transitions',
 'ASQA: Secure access to sensitive student data', 'auth.login events logged to audit_trail',
 'High — password-protected admin access',
 'partial', ARRAY['auth', 'login', 'security']),

('FEAT-002', 'Google OAuth Login', 'Authentication', 'Login',
 'Google OAuth 2.0 social login for admin and trainer users.',
 'Convenient single sign-on option for staff using Google Workspace.',
 'implemented', 'medium', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/LoginPage.tsx', 'AI', 'requires_review', true,
 'Supabase Auth OAuth provider config', 'LoginPage Google sign-in button',
 NULL, 'auth.login events logged', 'Medium — relies on Google identity provider',
 'partial', ARRAY['auth', 'oauth', 'google']),

('FEAT-003', 'Admin OTP Two-Factor Authentication', 'Authentication', 'MFA',
 '6-digit time-limited OTP sent via email to verify admin identity after login. 30-day TTL stored in localStorage. Admin-level accounts only.',
 'Protect admin accounts with a second authentication factor against unauthorised access.',
 'implemented', 'critical', 'v0.1', '2026-06-30 03:07:50+00',
 'Migration + Edge Function', 'supabase/migrations/20260630030750_create_admin_otp_codes.sql', 'AI', 'requires_review', true,
 'admin_otp_codes table (RLS, no client policies, service role only)',
 'LoginPage OTP verification step',
 'ASQA: Protects access to student records', 'auth.otp_verified events logged',
 'Critical — protects admin portal',
 'partial', ARRAY['auth', 'otp', 'mfa', '2fa', 'security']),

('FEAT-004', 'Password Reset Flow', 'Authentication', 'Recovery',
 'Forgot-password flow with Supabase email recovery link. Includes recovery view after link clicked.',
 'Allow users to regain access to their account.',
 'implemented', 'high', 'v0.1', '2026-06-27 00:00:00+00',
 'Component', 'src/pages/LoginPage.tsx', 'AI', 'requires_review', true,
 NULL, 'LoginPage forgot-password and recovery views',
 NULL, 'auth.password_reset_requested logged', NULL,
 'partial', ARRAY['auth', 'password-reset']),

('FEAT-005', 'Role-Based Access Control', 'Authentication', 'Authorisation',
 'Three user roles: admin, trainer, candidate. Role stored on profiles table. RLS policies enforce role-based data access throughout. Admin role auto-assigned to first user via trigger.',
 'Ensure each user type sees only the data appropriate to their role.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Migration', 'supabase/migrations/20260627014708_create_profiles_and_settings.sql', 'AI', 'requires_review', true,
 'profiles.role column; RLS policies on every table; get_my_role() SECURITY DEFINER function',
 'AdminLayout role-gated navigation', 'ASQA: Only authorised users access student data',
 'Role-based audit trail actors', 'Critical — enforces data access boundaries',
 'partial', ARRAY['auth', 'rbac', 'roles', 'security']),

('FEAT-006', 'OTP Disable Flag (Per User)', 'Authentication', 'MFA',
 'Per-profile flag (otp_disabled) allowing OTP to be bypassed for specific admin users. Useful for development or trusted environments.',
 'Operational flexibility for trusted admin accounts without compromising overall security posture.',
 'implemented', 'low', 'v0.1', '2026-07-01 09:23:24+00',
 'Migration', 'supabase/migrations/20260701092324_add_otp_disabled_flag.sql', 'AI', 'requires_review', true,
 'profiles.otp_disabled boolean column', NULL, NULL, NULL, 'Medium — bypass capability must be managed carefully',
 'missing', ARRAY['auth', 'otp', 'admin']),

('FEAT-007', 'Authentication Context & Hooks', 'Authentication', 'Utility',
 'React context (AuthProvider) and useAuth() hook providing auth state, profile, OTP status, and sign-out functionality throughout the application.',
 'Centralised auth state management so all components share a consistent view of the current user.',
 'implemented', 'critical', 'v0.1', '2026-06-27 00:00:00+00',
 'Library', 'src/lib/auth.tsx', 'AI', 'requires_review', true,
 NULL, 'Wraps entire React app', NULL,
 'Auth events logged from auth.tsx', NULL,
 'partial', ARRAY['auth', 'react', 'context', 'hooks'])

ON CONFLICT (feature_id) DO NOTHING;
