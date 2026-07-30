-- Set Engineering Browser Test account profile
-- Temporarily disable role escalation trigger to set admin role
ALTER TABLE profiles DISABLE TRIGGER prevent_role_escalation;

INSERT INTO profiles (id, email, full_name, role, otp_disabled)
SELECT u.id, u.email, 'Engineering Browser Test', 'admin', true
FROM auth.users u
WHERE u.email = 'engineering.test@eios.local'
ON CONFLICT (id) DO UPDATE SET
  role = 'admin',
  otp_disabled = true,
  full_name = 'Engineering Browser Test',
  email = EXCLUDED.email;

-- Re-enable the trigger
ALTER TABLE profiles ENABLE TRIGGER prevent_role_escalation;

-- Verify
SELECT p.id, p.email, p.full_name, p.role, p.otp_disabled
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'engineering.test@eios.local';
