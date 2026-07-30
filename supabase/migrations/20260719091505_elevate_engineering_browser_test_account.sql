-- Elevate Engineering Browser Test account to admin with OTP disabled
ALTER TABLE profiles DISABLE TRIGGER prevent_role_escalation;

UPDATE profiles SET 
  role = 'admin', 
  otp_disabled = true,
  full_name = 'Engineering Browser Test'
WHERE id = (SELECT id FROM auth.users WHERE email = 'engineering.test@eios.local');

ALTER TABLE profiles ENABLE TRIGGER prevent_role_escalation;

-- Verify
SELECT p.id, p.email, p.full_name, p.role, p.otp_disabled
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'engineering.test@eios.local';
