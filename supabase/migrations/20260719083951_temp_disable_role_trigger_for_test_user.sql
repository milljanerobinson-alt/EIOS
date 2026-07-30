-- Temporarily disable the role escalation trigger to set test admin role
ALTER TABLE profiles DISABLE TRIGGER prevent_role_escalation;

UPDATE profiles SET role = 'admin' 
WHERE id = (SELECT id FROM auth.users WHERE email = 'test-admin@eios.engineering');

-- Re-enable the trigger
ALTER TABLE profiles ENABLE TRIGGER prevent_role_escalation;
