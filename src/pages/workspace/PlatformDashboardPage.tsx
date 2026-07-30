import { useState, useEffect } from 'react';
import {
  Settings, Users, CreditCard, Mail, Plug, CheckCircle2,
  XCircle, AlertTriangle, Activity, Database, Zap, Clock,
  ArrowRight, Globe,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PlatformStats {
  totalUsers: number;
  aiProvider: string | null;
  environment: string;
  axcelerateConnected: boolean;
  emailConfigured: boolean;
  queuePending: number;
}

function StatusDot({ ok, unknown }: { ok: boolean; unknown?: boolean }) {
  if (unknown) return <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />;
  return <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-400'} shrink-0`} />;
}

export function PlatformDashboardPage() {
  const [stats, setStats] = useState<PlatformStats>({
    totalUsers: 0,
    aiProvider: null,
    environment: 'production',
    axcelerateConnected: false,
    emailConfigured: false,
    queuePending: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [profilesRes, envRes, aiRes, axRes, emailRes, queueRes] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('settings').select('value').eq('key', 'environment').maybeSingle(),
      supabase.from('ai_provider_configs').select('display_name').eq('is_default', true).eq('is_enabled', true).maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'axcelerate_api_key').maybeSingle(),
      supabase.from('settings').select('value').eq('key', 'resend_api_key').maybeSingle(),
      supabase.from('axcelerate_writeback_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    setStats({
      totalUsers: profilesRes.count ?? 0,
      aiProvider: aiRes.data?.display_name ?? null,
      environment: envRes.data?.value ?? 'production',
      axcelerateConnected: !!(axRes.data?.value),
      emailConfigured: !!(emailRes.data?.value),
      queuePending: queueRes.count ?? 0,
    });
    setLoading(false);
  }

  const envColor = stats.environment === 'production' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' :
    stats.environment === 'staging' ? 'text-amber-700 bg-amber-50 border-amber-200' :
    'text-blue-700 bg-blue-50 border-blue-200';

  const HEALTH_ITEMS = [
    { label: 'aXcelerate Integration', ok: stats.axcelerateConnected, icon: Plug, detail: stats.axcelerateConnected ? 'Connected' : 'Not configured', action: 'axcelerate-inbound' },
    { label: 'Email (Resend)', ok: stats.emailConfigured, icon: Mail, detail: stats.emailConfigured ? 'Configured' : 'Not configured', action: 'email-activity' },
    { label: 'AI Provider', ok: !!stats.aiProvider, icon: Zap, detail: stats.aiProvider ?? 'Not configured', action: 'ai-providers' },
    { label: 'Write-back Queue', ok: stats.queuePending === 0, icon: Database, detail: stats.queuePending > 0 ? `${stats.queuePending} pending` : 'All clear', action: 'axcelerate-log' },
  ];

  const CONFIG_SECTIONS = [
    {
      title: 'Organisation',
      icon: Globe,
      items: ['Organisation profile', 'Branding & logo', 'Regional settings'],
      action: 'settings',
      color: 'text-slate-600 bg-slate-100',
    },
    {
      title: 'Users & Access',
      icon: Users,
      items: ['User accounts', 'Workspace access', 'Permissions'],
      action: 'users',
      color: 'text-blue-600 bg-blue-50',
    },
    {
      title: 'Billing & Usage',
      icon: CreditCard,
      items: ['Subscription plan', 'AI usage costs', 'Invoices'],
      action: 'billing',
      color: 'text-teal-600 bg-teal-50',
    },
    {
      title: 'Integrations',
      icon: Plug,
      items: ['aXcelerate sync', 'Email provider', 'API keys'],
      action: 'axcelerate-inbound',
      color: 'text-amber-600 bg-amber-50',
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Overview</h1>
          <p className="text-slate-500 mt-1 text-sm">Review platform configuration and system health.</p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full border capitalize ${envColor}`}>
          {stats.environment}
        </span>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Users', value: loading ? '—' : String(stats.totalUsers), icon: Users, color: 'text-blue-600 bg-blue-50 border-blue-100' },
          { label: 'AI Provider', value: loading ? '—' : (stats.aiProvider ?? 'None'), icon: Zap, color: 'text-violet-600 bg-violet-50 border-violet-100' },
          { label: 'Environment', value: loading ? '—' : stats.environment, icon: Globe, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
          { label: 'Queue Pending', value: loading ? '—' : String(stats.queuePending), icon: Database, color: stats.queuePending > 0 ? 'text-amber-600 bg-amber-50 border-amber-100' : 'text-slate-500 bg-slate-50 border-slate-100' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className={`bg-white rounded-2xl border ${color.split(' ')[2]} p-5 flex items-start gap-4`}>
            <div className={`w-10 h-10 rounded-xl ${color.split(' ').slice(1, 3).join(' ')} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color.split(' ')[0]}`} />
            </div>
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-900 truncate">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* System health */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-4">System Health</h2>
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {HEALTH_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={`flex items-center gap-4 px-5 py-4 ${i < HEALTH_ITEMS.length - 1 ? 'border-b border-slate-100' : ''}`}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.detail}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusDot ok={item.ok} unknown={loading} />
                  {!loading && (
                    <span className={`text-xs font-medium ${item.ok ? 'text-emerald-600' : 'text-red-500'}`}>
                      {item.ok ? 'OK' : 'Action needed'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Configuration sections */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-4">Configuration</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {CONFIG_SECTIONS.map(section => {
            const Icon = section.icon;
            return (
              <div key={section.title} className="bg-white rounded-2xl border border-slate-200 p-5 hover:border-slate-300 transition-colors">
                <div className="flex items-start gap-3 mb-3">
                  <div className={`w-9 h-9 rounded-xl ${section.color} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-4 h-4 ${section.color.split(' ')[0]}`} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">{section.title}</h3>
                    <ul className="mt-1 space-y-0.5">
                      {section.items.map(item => (
                        <li key={item} className="text-xs text-slate-400">{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
