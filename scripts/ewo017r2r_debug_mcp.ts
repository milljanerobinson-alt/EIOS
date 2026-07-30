import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

async function main() {
  const s = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await s.auth.signInWithPassword({
    email: 'engineering.test@eios.local',
    password: 'EiosBrowserTest2026!',
  });
  if (error || !data.session) {
    console.error('Auth failed:', error?.message);
    process.exit(1);
  }
  const token = data.session.access_token;
  console.log('Token obtained, length:', token.length);

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/atd-mcp-server`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: 'tools/call',
      params: {
        name: 'submit_conversation_inspection',
        arguments: {
          natural_language_request: 'Inspect Engineering Work Order EWO-017R.2R and make it the active Engineering Work Order for this conversation. Do not perform any lifecycle changes.',
          client_id: 'mcp-test-client',
          conversation_id: 'chatgpt-conv-debug1',
        },
      },
    }),
  });

  console.log('HTTP Status:', resp.status);
  const text = await resp.text();
  console.log('Raw response (first 3000 chars):');
  console.log(text.substring(0, 3000));
}

main().catch(e => { console.error(e); process.exit(1); });
