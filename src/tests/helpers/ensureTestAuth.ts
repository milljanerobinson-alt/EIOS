import { supabase } from '../../lib/supabase';

const TEST_EMAIL = 'engineering.test@eios.local';
const TEST_PASSWORD = 'EiosBrowserTest2026!';

let authenticated = false;

export async function ensureTestAuth() {
  if (authenticated) return;
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (error || !data.session?.access_token) {
    throw new Error(`Test auth failed: ${error?.message ?? 'no session'}`);
  }
  authenticated = true;
}
