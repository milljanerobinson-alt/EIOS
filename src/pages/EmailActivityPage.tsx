import { useEffect, useState } from 'react';
import { Mail, Loader2, RefreshCw, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface EmailEntry {
  id: string;
  to_email: string;
  to_name: string | null;
  subject: string | null;
  template: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  created_at: string;
}

const STATUS_CFG: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  sent:    { color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
  failed:  { color: 'bg-red-100 text-red-700',         icon: XCircle      },
  pending: { color: 'bg-amber-100 text-amber-700',     icon: AlertCircle  },
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function EmailActivityPage() {
  const [entries, setEntries] = useState<EmailEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('email_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setEntries((data || []) as EmailEntry[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">Email Activity</h2>
        <p className="text-sm text-slate-500 mt-1">Outbound email queue and delivery history.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
            <Mail className="w-4 h-4 text-slate-400" />
            Email Queue
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
            <Mail className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">No email records yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const cfg = STATUS_CFG[entry.status] ?? { color: 'bg-slate-100 text-slate-600', icon: AlertCircle };
              const Icon = cfg.icon;
              return (
                <div key={entry.id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{entry.to_email}</p>
                    {entry.subject && <p className="text-xs text-slate-500 truncate mt-0.5">{entry.subject}</p>}
                    {entry.error && <p className="text-xs text-red-500 mt-0.5 truncate">{entry.error}</p>}
                  </div>
                  {entry.template && (
                    <span className="text-xs text-slate-400 hidden sm:block">{entry.template}</span>
                  )}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${cfg.color}`}>
                    <Icon className="w-3 h-3" />
                    {entry.status}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
                    <Clock className="w-3 h-3" />
                    {fmt(entry.sent_at || entry.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
