import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, Globe, ToggleLeft, ToggleRight, Save, Loader2,
  AlertCircle, CheckCircle2, RefreshCw, Brain, Sparkles, FileText,
  ChevronDown, Trash2, Plus, Edit3, X, Activity, Settings, RotateCcw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleConfig {
  id: string;
  schedule_name: string;
  enabled: boolean;
  time_of_day: string;
  timezone: string;
  weekdays_only: boolean;
  days_of_week: number[] | null;
  catch_up_on_startup: boolean;
  retention_days: number;
  ai_model_override: string | null;
  template_id: string | null;
  last_run_at: string | null;
  last_run_briefing_id: string | null;
  run_count: number;
  created_at: string;
}

interface BriefingTemplate {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  template_type: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  system_prompt_template: string;
}

interface AIProvider {
  id: string;
  provider: string;
  display_name: string;
  model: string;
  is_default: boolean;
  is_enabled: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIMEZONES = [
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
  'Australia/Adelaide', 'Australia/Darwin', 'Australia/Hobart',
  'Pacific/Auckland', 'Asia/Singapore', 'Asia/Tokyo', 'Europe/London',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'UTC',
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fmtDatetime(iso: string | null): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── Schedule Config Editor ───────────────────────────────────────────────────

function ScheduleConfigEditor({
  config,
  templates,
  providers,
  onSaved,
}: {
  config: ScheduleConfig;
  templates: BriefingTemplate[];
  providers: AIProvider[];
  onSaved: (updated: ScheduleConfig) => void;
}) {
  const [form, setForm] = useState({
    schedule_name: config.schedule_name,
    enabled: config.enabled,
    time_of_day: config.time_of_day.slice(0, 5),
    timezone: config.timezone,
    weekdays_only: config.weekdays_only,
    days_of_week: config.days_of_week ?? [],
    catch_up_on_startup: config.catch_up_on_startup,
    retention_days: config.retention_days,
    ai_model_override: config.ai_model_override ?? '',
    template_id: config.template_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useCustomDays = form.days_of_week.length > 0;

  function toggleDay(d: number) {
    setForm(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(d)
        ? prev.days_of_week.filter(x => x !== d)
        : [...prev.days_of_week, d].sort(),
      weekdays_only: false,
    }));
  }

  function setWeekdaysOnly(v: boolean) {
    setForm(prev => ({ ...prev, weekdays_only: v, days_of_week: v ? [] : prev.days_of_week }));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        schedule_name: form.schedule_name,
        enabled: form.enabled,
        time_of_day: form.time_of_day,
        timezone: form.timezone,
        weekdays_only: form.weekdays_only && form.days_of_week.length === 0,
        days_of_week: form.days_of_week.length > 0 ? form.days_of_week : null,
        catch_up_on_startup: form.catch_up_on_startup,
        retention_days: form.retention_days,
        ai_model_override: form.ai_model_override || null,
        template_id: form.template_id || null,
        updated_at: new Date().toISOString(),
      };
      const { data, error: err } = await supabase
        .from('ecc_briefing_schedule_config')
        .update(payload)
        .eq('id', config.id)
        .select()
        .single();
      if (err) throw err;
      onSaved(data as ScheduleConfig);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={form.schedule_name}
            onChange={e => setForm(p => ({ ...p, schedule_name: e.target.value }))}
            className="text-sm font-bold text-slate-800 bg-transparent border-0 border-b border-slate-200 focus:border-blue-400 focus:outline-none w-full py-0.5"
          />
        </div>
        <button
          onClick={() => setForm(p => ({ ...p, enabled: !p.enabled }))}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
            form.enabled
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-slate-50 border-slate-200 text-slate-500'
          }`}
        >
          {form.enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {form.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Time of day */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time of day</label>
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="time"
              value={form.time_of_day}
              onChange={e => setForm(p => ({ ...p, time_of_day: e.target.value }))}
              className="w-full pl-9 pr-3 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Timezone</label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={form.timezone}
              onChange={e => setForm(p => ({ ...p, timezone: e.target.value }))}
              className="w-full pl-9 pr-8 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 appearance-none"
            >
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Schedule frequency */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-2">Frequency</label>
        <div className="space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="radio"
              checked={form.weekdays_only && form.days_of_week.length === 0}
              onChange={() => { setWeekdaysOnly(true); }}
              className="accent-blue-600"
            />
            <span className="text-sm text-slate-700">Weekdays only (Mon–Fri)</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="radio"
              checked={!form.weekdays_only && form.days_of_week.length === 0}
              onChange={() => { setForm(p => ({ ...p, weekdays_only: false, days_of_week: [] })); }}
              className="accent-blue-600"
            />
            <span className="text-sm text-slate-700">Every day</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="radio"
              checked={useCustomDays}
              onChange={() => { setForm(p => ({ ...p, weekdays_only: false, days_of_week: [1, 2, 3, 4, 5] })); }}
              className="accent-blue-600"
            />
            <span className="text-sm text-slate-700">Custom days</span>
          </label>
          {useCustomDays && (
            <div className="flex gap-1.5 mt-2 ml-6">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-bold transition-all border ${
                    form.days_of_week.includes(i)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Template */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Briefing template</label>
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={form.template_id}
              onChange={e => setForm(p => ({ ...p, template_id: e.target.value }))}
              className="w-full pl-9 pr-8 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 appearance-none"
            >
              <option value="">Default template</option>
              {templates.filter(t => t.is_active).map(t => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (default)' : ''}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* AI model override */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">AI model override</label>
          <div className="relative">
            <Brain className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <select
              value={form.ai_model_override}
              onChange={e => setForm(p => ({ ...p, ai_model_override: e.target.value }))}
              className="w-full pl-9 pr-8 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 appearance-none"
            >
              <option value="">Use default model</option>
              {providers.filter(p => p.is_enabled).map(p => (
                <option key={p.id} value={p.model}>{p.display_name} — {p.model}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Retention */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Retain briefings for (days)</label>
          <input
            type="number"
            min={7}
            max={3650}
            value={form.retention_days}
            onChange={e => setForm(p => ({ ...p, retention_days: parseInt(e.target.value) || 365 }))}
            className="w-full px-3 py-2 text-sm text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* Catch-up */}
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Catch-up on startup</label>
          <button
            onClick={() => setForm(p => ({ ...p, catch_up_on_startup: !p.catch_up_on_startup }))}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
              form.catch_up_on_startup
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            {form.catch_up_on_startup ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {form.catch_up_on_startup ? 'Enabled' : 'Disabled'}
            <span className="text-xs text-slate-400 ml-1 font-normal">— runs on first dashboard open</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Last run: <span className="text-slate-600">{fmtDatetime(config.last_run_at)}</span></span>
          {config.run_count > 0 && <span>({config.run_count} runs)</span>}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

// ─── Template Card ─────────────────────────────────────────────────────────────

const TEMPLATE_ICONS: Record<string, typeof Brain> = {
  'daily-executive': Brain,
  'engineering-ops': Activity,
  'release-readiness': CheckCircle2,
  'governance': FileText,
  'platform-health': RefreshCw,
  'ai-cost': Sparkles,
  'custom': Edit3,
};

const TEMPLATE_COLORS: Record<string, string> = {
  'daily-executive':  'from-blue-500 to-teal-500',
  'engineering-ops':  'from-violet-500 to-purple-600',
  'release-readiness':'from-emerald-500 to-green-600',
  'governance':       'from-amber-500 to-orange-500',
  'platform-health':  'from-cyan-500 to-sky-600',
  'ai-cost':          'from-pink-500 to-rose-500',
  'custom':           'from-slate-500 to-slate-600',
};

function TemplateCard({
  template,
  onToggle,
  toggling,
}: {
  template: BriefingTemplate;
  onToggle: (id: string, active: boolean) => void;
  toggling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = TEMPLATE_ICONS[template.slug] ?? FileText;
  const gradient = TEMPLATE_COLORS[template.slug] ?? 'from-slate-500 to-slate-600';

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${
      template.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'
    }`}>
      <div className="px-4 py-3 flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0`}>
          <Icon className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-slate-800 truncate">{template.name}</p>
            {template.is_default && (
              <span className="text-[9px] font-black px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full uppercase tracking-wide shrink-0">Default</span>
            )}
          </div>
          {template.description && (
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{template.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
            title="Preview prompt"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => onToggle(template.id, !template.is_active)}
            disabled={toggling || template.is_default}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              template.is_active
                ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {template.is_active ? 'Active' : 'Inactive'}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">System Prompt Template</p>
            <pre className="text-[10px] text-slate-600 whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
              {template.system_prompt_template.slice(0, 800)}{template.system_prompt_template.length > 800 ? '\n…' : ''}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ECCBriefingSettingsPage() {
  const [tab, setTab] = useState<'schedule' | 'templates'>('schedule');

  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);

  const [templates, setTemplates] = useState<BriefingTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  const [providers, setProviders] = useState<AIProvider[]>([]);

  const [togglingTemplate, setTogglingTemplate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setSchedulesLoading(true);
    setTemplatesLoading(true);
    setLoadError(null);
    try {
      const [schedRes, tmplRes, provRes] = await Promise.all([
        supabase.from('ecc_briefing_schedule_config').select('*').order('created_at'),
        supabase.from('ecc_briefing_templates').select('*').order('sort_order'),
        supabase.from('ecc_ai_providers').select('id,provider,display_name,model,is_default,is_enabled').eq('is_enabled', true),
      ]);
      if (schedRes.error) throw schedRes.error;
      if (tmplRes.error) throw tmplRes.error;
      setSchedules((schedRes.data ?? []) as ScheduleConfig[]);
      setTemplates((tmplRes.data ?? []) as BriefingTemplate[]);
      setProviders((provRes.data ?? []) as AIProvider[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setSchedulesLoading(false);
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleToggleTemplate(id: string, active: boolean) {
    setTogglingTemplate(id);
    try {
      await supabase.from('ecc_briefing_templates').update({ is_active: active }).eq('id', id);
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: active } : t));
    } finally {
      setTogglingTemplate(null);
    }
  }

  const TABS = [
    { key: 'schedule' as const, label: 'Schedules', icon: Calendar },
    { key: 'templates' as const, label: 'Templates', icon: FileText },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shrink-0">
            <Brain className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">Executive Briefing Settings</h2>
            <p className="text-xs text-slate-500">Schedules, templates and generation configuration</p>
          </div>
          <button
            onClick={loadData}
            className="ml-auto p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  tab === t.key
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-2xl mx-auto space-y-4">

          {loadError && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {loadError}
              <button onClick={loadData} className="ml-auto underline font-semibold">Retry</button>
            </div>
          )}

          {/* ── SCHEDULES TAB ── */}
          {tab === 'schedule' && (
            <>
              {schedulesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : schedules.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-600">No schedules configured</p>
                  <p className="text-xs text-slate-400 mt-1">Add a schedule to enable automatic briefings.</p>
                </div>
              ) : (
                schedules.map(cfg => (
                  <div key={cfg.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-bold text-slate-800">Schedule Configuration</span>
                      <span className={`ml-auto text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${
                        cfg.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {cfg.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <div className="p-4">
                      <ScheduleConfigEditor
                        config={cfg}
                        templates={templates}
                        providers={providers}
                        onSaved={updated => setSchedules(prev => prev.map(s => s.id === updated.id ? updated : s))}
                      />
                    </div>
                  </div>
                ))
              )}

              {/* Info card */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Activity className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-blue-800">How scheduling works</p>
                    <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                      A pg_cron job fires every hour and checks whether any enabled schedule is within ±30 minutes
                      of its configured time. If so, it triggers the generation edge function for that schedule.
                      Each schedule generates at most one briefing per day per timezone date.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── TEMPLATES TAB ── */}
          {tab === 'templates' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {templates.filter(t => t.is_active).length} of {templates.length} templates active
                </p>
              </div>

              {templatesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="space-y-3">
                  {templates.map(t => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      onToggle={handleToggleTemplate}
                      toggling={togglingTemplate === t.id}
                    />
                  ))}
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-slate-700">Adding new report types</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      To add a new scheduled report type (e.g. Weekly Engineering Report), insert a row into
                      <code className="mx-1 px-1 py-0.5 bg-slate-200 rounded text-slate-700 font-mono text-[10px]">ecc_briefing_templates</code>
                      and a row into
                      <code className="mx-1 px-1 py-0.5 bg-slate-200 rounded text-slate-700 font-mono text-[10px]">ecc_briefing_schedule_config</code>.
                      No schema changes or code deployments needed.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
