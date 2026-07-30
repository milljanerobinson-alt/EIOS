import { useEffect, useState } from 'react';
import { ScrollText, Loader2, RefreshCw, User, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('audit_trail')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setEntries((data || []) as AuditEntry[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Audit Log</h2>
        <p className="text-sm text-slate-500 mt-1">Full history of actions taken in the platform.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-slate-400" />
            Recent Activity
          </h3>
          <button onClick={load} className="btn-ghost text-sm flex items-center gap-1.5" disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading…
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-16">
            <ScrollText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No audit records yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <div key={entry.id} className="px-5 py-3.5 flex items-start gap-3 hover:bg-slate-50">
                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900">{entry.action}</span>
                    {entry.entity_type && (
                      <span className="text-xs text-slate-400">{entry.entity_type}</span>
                    )}
                  </div>
                  {entry.actor_name && (
                    <p className="text-xs text-slate-500 mt-0.5">{entry.actor_name}{entry.actor_email ? ` · ${entry.actor_email}` : ''}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {fmt(entry.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
