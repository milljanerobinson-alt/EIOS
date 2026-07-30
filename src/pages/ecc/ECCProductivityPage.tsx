import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, Zap, Brain, BarChart3,
  CheckCircle2, Package, Shield, FileText, Clock, Loader2,
  AlertCircle, RefreshCw, Plus, Save, X, ChevronDown, Activity,
  Target, Cpu, Layers, Star, ArrowUpRight, ArrowDownRight, Minus,
  Calendar, Users, Sparkles, BookOpen,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostRecord {
  id: string;
  record_date: string;
  provider: string;
  category: string;
  amount_usd: number;
  description: string;
  engineer_name: string | null;
}

interface ManualWork {
  id: string;
  work_date: string;
  engineer_name: string;
  hours: number;
  hourly_rate_usd: number;
  estimated_cost_usd: number;
  task_category: string;
  description: string;
}

interface AIUsage {
  id: string;
  feature: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
  success: boolean;
  created_at: string;
}

interface PromptRecord {
  id: string;
  submission_date: string;
  prompt_summary: string;
  provider: string;
  engineering_phase: string | null;
  success: boolean;
  revisions_needed: number;
  time_to_completion_hours: number | null;
  defects_found: number;
  rollback_required: boolean;
  estimated_cost_usd: number | null;
}

interface DashboardData {
  // AI usage from existing tables
  aiUsage: AIUsage[];
  briefingCosts: { estimated_cost_usd: number; created_at: string; ai_model: string | null }[];
  // New tables
  costRecords: CostRecord[];
  manualWork: ManualWork[];
  promptRecords: PromptRecord[];
  // Counts from existing tables
  featureCount: number;
  releaseCount: number;
  reviewCount: number;
  auditCount: number;
  phaseCount: number;
}

type TabKey = 'overview' | 'spend' | 'productivity' | 'roi' | 'manual' | 'prompts';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt$ = (n: number, decimals = 2) =>
  n < 0.01 && n > 0 ? `$${n.toFixed(4)}` : `$${n.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

function pct(a: number, b: number) {
  if (!b) return 0;
  return Math.round((a / b) * 100);
}

function getMonthLabel(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-AU', { month: 'short', year: '2-digit' });
}

function groupByMonth<T extends { created_at?: string; record_date?: string; work_date?: string; submission_date?: string }>(
  items: T[],
  dateKey: keyof T,
  valueKey: keyof T,
) {
  const map = new Map<string, number>();
  for (const item of items) {
    const raw = item[dateKey] as string;
    if (!raw) continue;
    const d = new Date(raw);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(key, (map.get(key) ?? 0) + Number(item[valueKey] ?? 0));
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// ─── SVG Sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ data, color = '#3b82f6', height = 40 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 0.001);
  const w = 120;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${height - (v / max) * (height - 4)}`).join(' ');
  return (
    <svg width={w} height={height} className="overflow-visible shrink-0">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Bar Chart (CSS) ──────────────────────────────────────────────────────────

function BarChart({ data, color = 'bg-blue-500', labelKey = 'label', valueKey = 'value', formatValue = (v: number) => fmt$(v) }: {
  data: { label: string; value: number; [k: string]: unknown }[];
  color?: string;
  labelKey?: string;
  valueKey?: string;
  formatValue?: (v: number) => string;
}) {
  const max = Math.max(...data.map(d => d[valueKey] as number), 0.001);
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d[labelKey] as string} className="flex items-center gap-2 group">
          <span className="text-[10px] text-slate-500 w-14 shrink-0 text-right">{d[labelKey] as string}</span>
          <div className="flex-1 h-5 bg-slate-50 rounded overflow-hidden border border-slate-100">
            <div
              className={`h-full ${color} rounded transition-all`}
              style={{ width: `${pct(d[valueKey] as number, max)}%`, minWidth: (d[valueKey] as number) > 0 ? '2px' : '0' }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-700 w-16 shrink-0">{formatValue(d[valueKey] as number)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color = 'text-blue-600', bg = 'bg-blue-50',
  trend, sparkData, sparkColor,
}: {
  label: string; value: string; sub?: string; icon: typeof DollarSign;
  color?: string; bg?: string;
  trend?: 'up' | 'down' | 'neutral';
  sparkData?: number[];
  sparkColor?: string;
}) {
  const TrendIcon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : Minus;
  const trendColor = trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-red-400' : 'text-slate-400';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        {trend && <TrendIcon className={`w-4 h-4 ${trendColor}`} />}
      </div>
      <div className="flex items-end justify-between mt-1">
        <div>
          <p className="text-[11px] text-slate-500 leading-tight">{label}</p>
          <p className="text-xl font-black text-slate-900 leading-tight mt-0.5">{value}</p>
          {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {sparkData && sparkData.length >= 2 && (
          <Sparkline data={sparkData} color={sparkColor ?? '#3b82f6'} height={36} />
        )}
      </div>
    </div>
  );
}

// ─── Provider Badge ───────────────────────────────────────────────────────────

const PROVIDER_CFG: Record<string, { label: string; color: string; bg: string }> = {
  bolt:       { label: 'Bolt',        color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
  openai:     { label: 'OpenAI',      color: 'text-emerald-700',bg: 'bg-emerald-50 border-emerald-200' },
  anthropic:  { label: 'Anthropic',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200' },
  gemini:     { label: 'Gemini',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  manual:     { label: 'Manual',      color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  other:      { label: 'Other',       color: 'text-rose-700',   bg: 'bg-rose-50 border-rose-200' },
};

function ProviderBadge({ provider }: { provider: string }) {
  const cfg = PROVIDER_CFG[provider.toLowerCase()] ?? PROVIDER_CFG.other;
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Add Cost Record Modal ─────────────────────────────────────────────────────

function AddCostRecordModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    record_date: new Date().toISOString().slice(0, 10),
    provider: 'bolt',
    category: 'feature',
    amount_usd: '',
    description: '',
    engineer_name: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.amount_usd || !form.description) { setError('Amount and description required'); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.from('ecc_engineering_cost_records').insert({
        record_date: form.record_date,
        provider: form.provider,
        category: form.category,
        amount_usd: parseFloat(form.amount_usd),
        description: form.description,
        engineer_name: form.engineer_name || null,
        notes: form.notes || null,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Record Engineering Cost</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
              <input type="date" value={form.record_date} onChange={e => setForm(p => ({ ...p, record_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Amount (USD)</label>
              <input type="number" step="0.01" placeholder="0.00" value={form.amount_usd} onChange={e => setForm(p => ({ ...p, amount_usd: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Provider</label>
              <select value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400">
                {Object.entries(PROVIDER_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400">
                {['feature','review','audit','release','support-plan','briefing','testing','specification','other'].map(c =>
                  <option key={c} value={c}>{c}</option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What was this cost for?" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Engineer (optional)</label>
            <input type="text" value={form.engineer_name} onChange={e => setForm(p => ({ ...p, engineer_name: e.target.value }))}
              placeholder="Engineer name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Manual Work Modal ─────────────────────────────────────────────────────

function AddManualWorkModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    work_date: new Date().toISOString().slice(0, 10),
    engineer_name: '',
    hours: '',
    hourly_rate_usd: '150',
    task_category: 'development',
    description: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!form.hours || !form.engineer_name || !form.description) { setError('Engineer, hours, and description required'); return; }
    setSaving(true);
    try {
      const { error: err } = await supabase.from('ecc_manual_engineering_work').insert({
        work_date: form.work_date,
        engineer_name: form.engineer_name,
        hours: parseFloat(form.hours),
        hourly_rate_usd: parseFloat(form.hourly_rate_usd) || 0,
        task_category: form.task_category,
        description: form.description,
      });
      if (err) throw err;
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const estimatedCost = (parseFloat(form.hours) || 0) * (parseFloat(form.hourly_rate_usd) || 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Record Manual Engineering Work</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Date</label>
              <input type="date" value={form.work_date} onChange={e => setForm(p => ({ ...p, work_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Engineer</label>
              <input type="text" value={form.engineer_name} onChange={e => setForm(p => ({ ...p, engineer_name: e.target.value }))}
                placeholder="Name" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Hours</label>
              <input type="number" step="0.25" min="0" value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))}
                placeholder="0.0" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Rate (USD/hr)</label>
              <input type="number" step="1" min="0" value={form.hourly_rate_usd} onChange={e => setForm(p => ({ ...p, hourly_rate_usd: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
            <select value={form.task_category} onChange={e => setForm(p => ({ ...p, task_category: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400">
              {['development','review','planning','testing','documentation','deployment','bug-fix','other'].map(c =>
                <option key={c} value={c}>{c}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="What was worked on?" className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400" />
          </div>
          {estimatedCost > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600">
              Estimated cost: <span className="font-bold text-slate-800">{fmt$(estimatedCost)}</span>
            </div>
          )}
          {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{error}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {saving ? 'Saving…' : 'Save Work'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: DashboardData }) {
  const totalAiCostFromLog = data.aiUsage.reduce((s, r) => s + r.estimated_cost_usd, 0);
  const totalBriefingCost = data.briefingCosts.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0);
  const totalManualCostRecords = data.costRecords.reduce((s, r) => s + r.amount_usd, 0);
  const totalManualWorkCost = data.manualWork.reduce((s, r) => s + r.estimated_cost_usd, 0);
  const totalManualHours = data.manualWork.reduce((s, r) => s + r.hours, 0);

  const boltCost = data.costRecords.filter(r => r.provider === 'bolt').reduce((s, r) => s + r.amount_usd, 0);
  const openaiCost = totalAiCostFromLog + totalBriefingCost;
  const otherAiCost = data.costRecords.filter(r => !['bolt', 'manual'].includes(r.provider)).reduce((s, r) => s + r.amount_usd, 0);
  const totalAiSpend = boltCost + openaiCost + otherAiCost;
  const totalEngCost = totalAiSpend + totalManualWorkCost + totalManualCostRecords;

  const totalFeatures = data.featureCount;
  const totalReleases = data.releaseCount;
  const totalReviews = data.reviewCount;
  const totalAudits = data.auditCount;

  const costPerFeature = totalFeatures > 0 ? totalEngCost / totalFeatures : 0;
  const costPerRelease = totalReleases > 0 ? totalEngCost / totalReleases : 0;
  const costPerReview = totalReviews > 0 ? totalEngCost / totalReviews : 0;
  const costPerAudit = totalAudits > 0 ? totalEngCost / totalAudits : 0;

  const estimatedHoursSaved = totalManualHours > 0 ? totalManualHours * 0.6 : Math.max(totalFeatures * 4, 20);
  const estimatedEngineeringValue = estimatedHoursSaved * 150;
  const roi = totalEngCost > 0 ? ((estimatedEngineeringValue - totalEngCost) / totalEngCost) * 100 : 0;
  const aiEfficiency = totalAiSpend > 0 ? Math.min(99, Math.round(70 + (totalFeatures / Math.max(totalAiSpend, 1)) * 100)) : 0;

  const totalBriefings = data.briefingCosts.length;
  const costPerBriefing = totalBriefings > 0 ? totalBriefingCost / totalBriefings : 0;

  // Monthly spend trend from ai_usage_log
  const monthlyAiSpend = groupByMonth(data.aiUsage, 'created_at', 'estimated_cost_usd');
  const sparkAi = monthlyAiSpend.slice(-6).map(([, v]) => v);

  return (
    <div className="space-y-5">
      {/* Primary KPIs */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Investment Overview</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Total Engineering Cost" value={fmt$(totalEngCost)} sub="All-time investment" icon={DollarSign} color="text-slate-700" bg="bg-slate-100" sparkData={sparkAi} sparkColor="#64748b" />
          <KpiCard label="Total AI Spend" value={fmt$(totalAiSpend)} sub="Bolt + API providers" icon={Brain} color="text-blue-600" bg="bg-blue-50" sparkData={sparkAi} sparkColor="#3b82f6" />
          <KpiCard label="Bolt Spend" value={fmt$(boltCost)} sub="Recorded Bolt sessions" icon={Zap} color="text-violet-600" bg="bg-violet-50" />
          <KpiCard label="OpenAI / API Spend" value={fmt$(openaiCost, 4)} sub="Logged API calls" icon={Sparkles} color="text-emerald-600" bg="bg-emerald-50" sparkData={sparkAi} sparkColor="#10b981" />
        </div>
      </div>

      {/* Productivity KPIs */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Productivity Delivered</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Features Delivered" value={String(totalFeatures)} icon={Layers} color="text-teal-600" bg="bg-teal-50" />
          <KpiCard label="Releases Shipped" value={String(totalReleases)} icon={Package} color="text-emerald-600" bg="bg-emerald-50" />
          <KpiCard label="Engineering Reviews" value={String(totalReviews)} icon={BookOpen} color="text-blue-600" bg="bg-blue-50" />
          <KpiCard label="Audits Completed" value={String(totalAudits)} icon={Shield} color="text-amber-600" bg="bg-amber-50" />
        </div>
      </div>

      {/* Cost Efficiency KPIs */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Cost Efficiency</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Cost per Feature" value={costPerFeature > 0 ? fmt$(costPerFeature) : '—'} icon={Target} color="text-slate-600" bg="bg-slate-50" />
          <KpiCard label="Cost per Release" value={costPerRelease > 0 ? fmt$(costPerRelease) : '—'} icon={Package} color="text-slate-600" bg="bg-slate-50" />
          <KpiCard label="Cost per Review" value={costPerReview > 0 ? fmt$(costPerReview) : '—'} icon={BookOpen} color="text-slate-600" bg="bg-slate-50" />
          <KpiCard label="Cost per Audit" value={costPerAudit > 0 ? fmt$(costPerAudit) : '—'} icon={Shield} color="text-slate-600" bg="bg-slate-50" />
        </div>
      </div>

      {/* ROI & AI Metrics */}
      <div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">ROI & AI Intelligence</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="Estimated ROI" value={roi !== 0 ? `${roi > 0 ? '+' : ''}${roi.toFixed(0)}%` : '—'} sub="vs manual engineering" icon={TrendingUp} color={roi > 0 ? 'text-emerald-600' : 'text-slate-500'} bg={roi > 0 ? 'bg-emerald-50' : 'bg-slate-50'} trend={roi > 0 ? 'up' : roi < 0 ? 'down' : 'neutral'} />
          <KpiCard label="Est. Hours Saved" value={`${estimatedHoursSaved.toFixed(0)}h`} sub="vs unassisted dev" icon={Clock} color="text-teal-600" bg="bg-teal-50" trend="up" />
          <KpiCard label="Cost per Briefing" value={costPerBriefing > 0 ? fmt$(costPerBriefing, 4) : '—'} sub={`${totalBriefings} briefings generated`} icon={FileText} color="text-blue-600" bg="bg-blue-50" />
          <KpiCard label="AI Efficiency Score" value={aiEfficiency > 0 ? `${aiEfficiency}` : '—'} sub="Features per $100 AI spend" icon={Activity} color="text-amber-600" bg="bg-amber-50" />
        </div>
      </div>

      {/* Manual Hours */}
      {totalManualHours > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Manual Engineering</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard label="Manual Hours Logged" value={`${totalManualHours.toFixed(1)}h`} icon={Clock} color="text-slate-600" bg="bg-slate-100" />
            <KpiCard label="Manual Engineering Cost" value={fmt$(totalManualWorkCost)} icon={DollarSign} color="text-slate-600" bg="bg-slate-100" />
            <KpiCard label="AI vs Manual Ratio" value={totalManualWorkCost > 0 ? `${(totalAiSpend / totalManualWorkCost).toFixed(1)}x` : '—'} sub="AI spend vs manual cost" icon={BarChart3} color="text-blue-600" bg="bg-blue-50" />
            <KpiCard label="Avg Hourly Rate" value={data.manualWork.length > 0 ? fmt$(data.manualWork.reduce((s, r) => s + r.hourly_rate_usd, 0) / data.manualWork.length) : '—'} sub="per hour" icon={Users} color="text-slate-600" bg="bg-slate-100" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Spend Analysis Tab ────────────────────────────────────────────────────────

function SpendTab({ data }: { data: DashboardData }) {
  const monthlyData = groupByMonth(data.aiUsage, 'created_at', 'estimated_cost_usd');
  const monthlyBriefings = groupByMonth(data.briefingCosts, 'created_at', 'estimated_cost_usd');

  // Combine monthly AI usage
  const combinedMonthly = new Map<string, number>();
  for (const [k, v] of monthlyData) combinedMonthly.set(k, (combinedMonthly.get(k) ?? 0) + v);
  for (const [k, v] of monthlyBriefings) combinedMonthly.set(k, (combinedMonthly.get(k) ?? 0) + v);

  const monthlyBarData = [...combinedMonthly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([k, v]) => ({
      label: getMonthLabel(k + '-01'),
      value: v,
    }));

  // Provider breakdown from cost records
  const providerMap = new Map<string, number>();
  for (const r of data.costRecords) providerMap.set(r.provider, (providerMap.get(r.provider) ?? 0) + r.amount_usd);
  // Add AI usage log totals
  const aiTotal = data.aiUsage.reduce((s, r) => s + r.estimated_cost_usd, 0);
  if (aiTotal > 0) providerMap.set('openai', (providerMap.get('openai') ?? 0) + aiTotal);

  const providerBarData = [...providerMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: PROVIDER_CFG[k]?.label ?? k, value: v }));

  // Category breakdown
  const catMap = new Map<string, number>();
  for (const r of data.costRecords) catMap.set(r.category, (catMap.get(r.category) ?? 0) + r.amount_usd);
  const catBarData = [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v }));

  // Model breakdown
  const modelMap = new Map<string, number>();
  for (const r of data.aiUsage) modelMap.set(r.model, (modelMap.get(r.model) ?? 0) + r.estimated_cost_usd);
  const modelBarData = [...modelMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ label: k, value: v }));

  const totalAiRequests = data.aiUsage.length;
  const cacheHits = data.aiUsage.filter(r => (r as unknown as { cache_hit?: boolean }).cache_hit).length;
  const totalTokens = data.aiUsage.reduce((s, r) => s + r.prompt_tokens + r.completion_tokens, 0);
  const avgCostPerRequest = totalAiRequests > 0 ? data.aiUsage.reduce((s, r) => s + r.estimated_cost_usd, 0) / totalAiRequests : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="AI API Requests" value={fmtK(totalAiRequests)} icon={Activity} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard label="Total Tokens Used" value={fmtK(totalTokens)} icon={Cpu} color="text-violet-600" bg="bg-violet-50" />
        <KpiCard label="Cache Hit Rate" value={totalAiRequests > 0 ? `${pct(cacheHits, totalAiRequests)}%` : '—'} sub="Saved API calls" icon={Zap} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard label="Avg Cost / Request" value={avgCostPerRequest > 0 ? fmt$(avgCostPerRequest, 5) : '—'} icon={DollarSign} color="text-amber-600" bg="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Monthly AI Spend</p>
          {monthlyBarData.length > 0 ? (
            <BarChart data={monthlyBarData} color="bg-blue-500" />
          ) : (
            <p className="text-xs text-slate-400 text-center py-6">No monthly data yet</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Spend by Provider</p>
          {providerBarData.length > 0 ? (
            <BarChart data={providerBarData} color="bg-violet-500" />
          ) : (
            <p className="text-xs text-slate-400 text-center py-6">Record costs to see provider breakdown</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Spend by Category</p>
          {catBarData.length > 0 ? (
            <BarChart data={catBarData} color="bg-teal-500" />
          ) : (
            <p className="text-xs text-slate-400 text-center py-6">Record categorised costs to see breakdown</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Cost by AI Model</p>
          {modelBarData.length > 0 ? (
            <BarChart data={modelBarData} color="bg-amber-500" />
          ) : (
            <p className="text-xs text-slate-400 text-center py-6">No model usage data yet</p>
          )}
        </div>
      </div>

      {/* Recent cost records */}
      {data.costRecords.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-bold text-slate-700">Recent Cost Records</p>
          </div>
          <div className="divide-y divide-slate-50">
            {data.costRecords.slice(0, 20).map(r => (
              <div key={r.id} className="px-4 py-2.5 flex items-center gap-3">
                <ProviderBadge provider={r.provider} />
                <span className="text-[10px] text-slate-400 shrink-0">{r.record_date}</span>
                <span className="text-xs text-slate-700 flex-1 truncate">{r.description}</span>
                <span className="text-xs font-bold text-slate-800 shrink-0">{fmt$(r.amount_usd, 4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Productivity Tab ──────────────────────────────────────────────────────────

function ProductivityTab({ data }: { data: DashboardData }) {
  const promptSuccessRate = data.promptRecords.length > 0
    ? pct(data.promptRecords.filter(r => r.success).length, data.promptRecords.length)
    : null;
  const avgRevisions = data.promptRecords.length > 0
    ? data.promptRecords.reduce((s, r) => s + r.revisions_needed, 0) / data.promptRecords.length
    : null;
  const rollbackRate = data.promptRecords.length > 0
    ? pct(data.promptRecords.filter(r => r.rollback_required).length, data.promptRecords.length)
    : null;

  // Autonomy readiness score
  const categories = [
    { label: 'AI Spec Generation', score: data.reviewCount > 0 ? 70 : 30, icon: FileText },
    { label: 'Automated Testing', score: data.featureCount > 10 ? 60 : 20, icon: CheckCircle2 },
    { label: 'AI Reviews', score: data.reviewCount > 5 ? 75 : 25, icon: BookOpen },
    { label: 'Release Automation', score: data.releaseCount > 3 ? 65 : 20, icon: Package },
    { label: 'Audit Automation', score: data.auditCount > 5 ? 70 : 30, icon: Shield },
    { label: 'Briefing Generation', score: data.briefingCosts.length > 5 ? 80 : 40, icon: Brain },
    { label: 'Human Approval Flow', score: 85, icon: CheckCircle2 },
    { label: 'AI Recommendations', score: 60, icon: Sparkles },
  ];
  const autonomyScore = Math.round(categories.reduce((s, c) => s + c.score, 0) / categories.length);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Phases Completed" value={String(data.phaseCount)} icon={Layers} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard label="Prompt Success Rate" value={promptSuccessRate !== null ? `${promptSuccessRate}%` : '—'} icon={Target} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard label="Avg Revisions/Prompt" value={avgRevisions !== null ? avgRevisions.toFixed(1) : '—'} icon={RefreshCw} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard label="Rollback Rate" value={rollbackRate !== null ? `${rollbackRate}%` : '—'} icon={AlertCircle} color={rollbackRate !== null && rollbackRate > 10 ? 'text-red-600' : 'text-slate-500'} bg={rollbackRate !== null && rollbackRate > 10 ? 'bg-red-50' : 'bg-slate-50'} />
      </div>

      {/* Autonomous Engineering Readiness */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-slate-700">Autonomous Engineering Readiness</p>
          <div className="flex items-center gap-2">
            <div className={`text-2xl font-black ${autonomyScore >= 70 ? 'text-emerald-600' : autonomyScore >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>
              {autonomyScore}
            </div>
            <div className="text-xs text-slate-400">/100</div>
          </div>
        </div>
        <div className="space-y-2.5">
          {categories.map(c => {
            const Icon = c.icon;
            const barColor = c.score >= 70 ? 'bg-emerald-500' : c.score >= 50 ? 'bg-amber-400' : 'bg-slate-300';
            return (
              <div key={c.label} className="flex items-center gap-3">
                <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-xs text-slate-600 w-36 shrink-0">{c.label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${c.score}%` }} />
                </div>
                <span className="text-xs font-bold text-slate-600 w-8 text-right">{c.score}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
          <div className="flex gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Advanced (70+)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Developing (50–69)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-300 inline-block" />Emerging (&lt;50)</span>
          </div>
        </div>
      </div>

      {/* Platform delivery summary */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-700 mb-3">Platform Delivery Summary</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Features in Platform', value: data.featureCount, icon: Layers, color: 'text-teal-600' },
            { label: 'Releases Shipped', value: data.releaseCount, icon: Package, color: 'text-emerald-600' },
            { label: 'Engineering Reviews', value: data.reviewCount, icon: BookOpen, color: 'text-blue-600' },
            { label: 'Audits Completed', value: data.auditCount, icon: Shield, color: 'text-amber-600' },
            { label: 'AI Briefings Generated', value: data.briefingCosts.length, icon: Brain, color: 'text-violet-600' },
            { label: 'Prompts Tracked', value: data.promptRecords.length, icon: Activity, color: 'text-slate-600' },
          ].map(m => {
            const Icon = m.icon;
            return (
              <div key={m.label} className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${m.color} shrink-0`} />
                <div>
                  <p className="text-lg font-black text-slate-900 leading-tight">{m.value}</p>
                  <p className="text-[10px] text-slate-500">{m.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── ROI Tab ──────────────────────────────────────────────────────────────────

function RoiTab({ data }: { data: DashboardData }) {
  const aiSpend = data.aiUsage.reduce((s, r) => s + r.estimated_cost_usd, 0)
    + data.briefingCosts.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0)
    + data.costRecords.reduce((s, r) => s + r.amount_usd, 0);
  const manualCost = data.manualWork.reduce((s, r) => s + r.estimated_cost_usd, 0);
  const totalInvestment = aiSpend + manualCost;

  // Estimate platform value based on features delivered
  const featureValueEstimate = data.featureCount * 2000;
  const releaseValueEstimate = data.releaseCount * 5000;
  const estimatedPlatformValue = featureValueEstimate + releaseValueEstimate;

  const roi = totalInvestment > 0 ? ((estimatedPlatformValue - totalInvestment) / totalInvestment) * 100 : 0;

  // Hourly equivalents
  const hoursIfManual = data.featureCount * 20 + data.releaseCount * 10 + data.reviewCount * 4 + data.auditCount * 3;
  const costIfAllManual = hoursIfManual * 150;
  const costSaved = costIfAllManual - totalInvestment;

  // Monthly forecast
  const monthlyData = groupByMonth(data.aiUsage, 'created_at', 'estimated_cost_usd');
  const recentMonths = monthlyData.slice(-3).map(([, v]) => v);
  const projectedMonthly = recentMonths.length > 0 ? recentMonths.reduce((s, v) => s + v, 0) / recentMonths.length : 0;
  const projectedAnnual = projectedMonthly * 12;

  const roiBarData = [
    { label: 'AI Investment', value: totalInvestment },
    { label: 'Est. Value', value: estimatedPlatformValue },
    { label: 'Cost if Manual', value: costIfAllManual },
    { label: 'Savings', value: Math.max(costSaved, 0) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total Investment" value={fmt$(totalInvestment)} icon={DollarSign} color="text-slate-700" bg="bg-slate-100" />
        <KpiCard label="Estimated Platform Value" value={fmt$(estimatedPlatformValue)} sub="Based on features + releases" icon={Star} color="text-emerald-600" bg="bg-emerald-50" trend="up" />
        <KpiCard label="Estimated ROI" value={`${roi > 0 ? '+' : ''}${roi.toFixed(0)}%`} icon={TrendingUp} color={roi > 0 ? 'text-emerald-600' : 'text-red-500'} bg={roi > 0 ? 'bg-emerald-50' : 'bg-red-50'} trend={roi > 0 ? 'up' : 'down'} />
        <KpiCard label="Cost Saved vs Manual" value={costSaved > 0 ? fmt$(costSaved) : '—'} sub={`${hoursIfManual}h at $150/h`} icon={Zap} color="text-teal-600" bg="bg-teal-50" trend={costSaved > 0 ? 'up' : 'neutral'} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Investment vs Value</p>
          <BarChart data={roiBarData} color="bg-emerald-500" formatValue={v => fmt$(v, 0)} />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Forecasting</p>
          <div className="space-y-3">
            {[
              { label: 'Projected Monthly AI Spend', value: projectedMonthly > 0 ? fmt$(projectedMonthly, 4) : 'Insufficient data', note: '3-month avg' },
              { label: 'Projected Annual Spend', value: projectedAnnual > 0 ? fmt$(projectedAnnual) : '—', note: 'Based on trend' },
              { label: 'Projected Feature Rate', value: `${Math.max(Math.round(data.featureCount / Math.max(data.phaseCount, 1)), 1)}/phase`, note: 'Historical avg' },
              { label: 'Projected Release Frequency', value: data.releaseCount > 0 ? `${(data.releaseCount / Math.max(data.phaseCount, 1)).toFixed(1)}/phase` : '—', note: 'Based on history' },
            ].map(m => (
              <div key={m.label} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <div>
                  <p className="text-xs font-semibold text-slate-700">{m.label}</p>
                  <p className="text-[10px] text-slate-400">{m.note}</p>
                </div>
                <p className="text-sm font-bold text-slate-800">{m.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <TrendingUp className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-800">ROI Methodology</p>
            <p className="text-xs text-blue-700 mt-1 leading-relaxed">
              Platform value is estimated at $2,000 per feature delivered and $5,000 per release shipped.
              Manual equivalent cost assumes 20 hours per feature, 10 hours per release, 4 hours per review,
              and 3 hours per audit at $150/hr. Record actual Bolt and manual costs for precise ROI tracking.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Manual Work Tab ───────────────────────────────────────────────────────────

function ManualWorkTab({ data, onAdd, onRefresh }: { data: DashboardData; onAdd: () => void; onRefresh: () => void }) {
  const totalHours = data.manualWork.reduce((s, r) => s + r.hours, 0);
  const totalCost = data.manualWork.reduce((s, r) => s + r.estimated_cost_usd, 0);

  const catTotals = new Map<string, { hours: number; cost: number }>();
  for (const r of data.manualWork) {
    const cur = catTotals.get(r.task_category) ?? { hours: 0, cost: 0 };
    catTotals.set(r.task_category, { hours: cur.hours + r.hours, cost: cur.cost + r.estimated_cost_usd });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs text-slate-500">
          <span><span className="font-bold text-slate-800">{totalHours.toFixed(1)}h</span> total logged</span>
          <span><span className="font-bold text-slate-800">{fmt$(totalCost)}</span> total cost</span>
          <span><span className="font-bold text-slate-800">{data.manualWork.length}</span> records</span>
        </div>
        <button onClick={onAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Log Work
        </button>
      </div>

      {catTotals.size > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-700 mb-3">Hours by Category</p>
          <BarChart
            data={[...catTotals.entries()].sort((a, b) => b[1].hours - a[1].hours).map(([k, v]) => ({ label: k, value: v.hours }))}
            color="bg-slate-500"
            formatValue={v => `${v.toFixed(1)}h`}
          />
        </div>
      )}

      {data.manualWork.length === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Clock className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">No manual work logged</p>
          <p className="text-xs text-slate-400 mt-1">Log manual engineering hours to enable ROI comparison.</p>
          <button onClick={onAdd} className="mt-4 px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Log First Entry
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-50">
            <div className="px-4 py-2 bg-slate-50 grid grid-cols-12 gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              <span className="col-span-2">Date</span>
              <span className="col-span-2">Engineer</span>
              <span className="col-span-1 text-right">Hours</span>
              <span className="col-span-2">Category</span>
              <span className="col-span-3">Description</span>
              <span className="col-span-2 text-right">Cost</span>
            </div>
            {data.manualWork.map(r => (
              <div key={r.id} className="px-4 py-2.5 grid grid-cols-12 gap-2 text-xs items-center">
                <span className="col-span-2 text-slate-400">{r.work_date}</span>
                <span className="col-span-2 text-slate-700 font-medium truncate">{r.engineer_name}</span>
                <span className="col-span-1 text-right font-bold text-slate-700">{r.hours}h</span>
                <span className="col-span-2 text-slate-500 truncate">{r.task_category}</span>
                <span className="col-span-3 text-slate-600 truncate">{r.description}</span>
                <span className="col-span-2 text-right font-bold text-slate-800">{fmt$(r.estimated_cost_usd)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Prompts Tab ──────────────────────────────────────────────────────────────

function PromptsTab({ data, onAdd, onRefresh }: { data: DashboardData; onAdd: () => void; onRefresh: () => void }) {
  const total = data.promptRecords.length;
  const successes = data.promptRecords.filter(r => r.success).length;
  const rollbacks = data.promptRecords.filter(r => r.rollback_required).length;
  const avgRevisions = total > 0 ? data.promptRecords.reduce((s, r) => s + r.revisions_needed, 0) / total : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Prompts Tracked" value={String(total)} icon={Activity} color="text-blue-600" bg="bg-blue-50" />
        <KpiCard label="Success Rate" value={total > 0 ? `${pct(successes, total)}%` : '—'} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-50" />
        <KpiCard label="Avg Revisions" value={total > 0 ? avgRevisions.toFixed(1) : '—'} icon={RefreshCw} color="text-amber-600" bg="bg-amber-50" />
        <KpiCard label="Rollbacks" value={String(rollbacks)} icon={AlertCircle} color={rollbacks > 0 ? 'text-red-600' : 'text-slate-400'} bg={rollbacks > 0 ? 'bg-red-50' : 'bg-slate-50'} />
      </div>

      {total === 0 ? (
        <div className="text-center py-12 bg-white border border-slate-200 rounded-xl">
          <Cpu className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600">No prompt records yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
            Track engineering prompts submitted to AI coding agents to measure effectiveness and improve prompt quality over time.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="divide-y divide-slate-50">
            {data.promptRecords.slice(0, 25).map(r => (
              <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {r.success
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <AlertCircle className="w-4 h-4 text-red-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{r.prompt_summary}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <ProviderBadge provider={r.provider} />
                    {r.engineering_phase && <span className="text-[10px] text-slate-400">{r.engineering_phase}</span>}
                    <span className="text-[10px] text-slate-400">{r.revisions_needed} revision{r.revisions_needed !== 1 ? 's' : ''}</span>
                    {r.rollback_required && <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">ROLLBACK</span>}
                  </div>
                </div>
                <span className="text-[10px] text-slate-400 shrink-0">{r.submission_date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Brain className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-slate-700">Prompt Effectiveness Tracking</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Add prompt records to track success rates, revision counts, and rollback frequency across AI providers and engineering phases.
              Historical data reveals which prompt styles produce the best outcomes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function ECCProductivityPage() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [showAddCost, setShowAddCost] = useState(false);
  const [showAddWork, setShowAddWork] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        aiUsageRes, briefingRes, costRecordsRes, manualWorkRes, promptsRes,
        featureRes, releaseRes, reviewRes, auditRes, phaseRes,
      ] = await Promise.all([
        supabase.from('ai_usage_log').select('id,feature,provider,model,prompt_tokens,completion_tokens,estimated_cost_usd,duration_ms,success,created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('ecc_ai_briefings').select('estimated_cost_usd,created_at,ai_model').order('created_at', { ascending: false }).limit(500),
        supabase.from('ecc_engineering_cost_records').select('id,record_date,provider,category,amount_usd,description,engineer_name').order('record_date', { ascending: false }).limit(200),
        supabase.from('ecc_manual_engineering_work').select('id,work_date,engineer_name,hours,hourly_rate_usd,estimated_cost_usd,task_category,description').order('work_date', { ascending: false }).limit(200),
        supabase.from('ecc_prompt_records').select('id,submission_date,prompt_summary,provider,engineering_phase,success,revisions_needed,time_to_completion_hours,defects_found,rollback_required,estimated_cost_usd').order('submission_date', { ascending: false }).limit(100),
        supabase.from('ecc_product_features').select('id', { count: 'exact', head: true }),
        supabase.from('ecc_release_candidates').select('id', { count: 'exact', head: true }),
        supabase.from('ecc_engineering_reviews').select('id', { count: 'exact', head: true }),
        supabase.from('ecc_audits').select('id', { count: 'exact', head: true }),
        supabase.from('ecc_phases').select('id', { count: 'exact', head: true }),
      ]);

      setData({
        aiUsage: (aiUsageRes.data ?? []) as AIUsage[],
        briefingCosts: (briefingRes.data ?? []) as DashboardData['briefingCosts'],
        costRecords: (costRecordsRes.data ?? []) as CostRecord[],
        manualWork: (manualWorkRes.data ?? []) as ManualWork[],
        promptRecords: (promptsRes.data ?? []) as PromptRecord[],
        featureCount: featureRes.count ?? 0,
        releaseCount: releaseRes.count ?? 0,
        reviewCount: reviewRes.count ?? 0,
        auditCount: auditRes.count ?? 0,
        phaseCount: phaseRes.count ?? 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const TABS: { key: TabKey; label: string; icon: typeof BarChart3 }[] = [
    { key: 'overview',    label: 'Overview',    icon: BarChart3 },
    { key: 'spend',       label: 'AI Spend',    icon: DollarSign },
    { key: 'productivity',label: 'Productivity', icon: Activity },
    { key: 'roi',         label: 'ROI',          icon: TrendingUp },
    { key: 'manual',      label: 'Manual Work',  icon: Clock },
    { key: 'prompts',     label: 'Prompts',      icon: Cpu },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-teal-500 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">Engineering Productivity & AI Cost Intelligence</h2>
            <p className="text-xs text-slate-500">Lifetime engineering investment, ROI, and productivity analytics</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setShowAddCost(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:border-blue-300 hover:text-blue-600 transition-all">
              <Plus className="w-3.5 h-3.5" />
              Record Cost
            </button>
            <button onClick={loadData} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors" title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  tab === t.key ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}>
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                <span className="text-sm text-slate-500">Loading analytics…</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
              <button onClick={loadData} className="ml-auto underline font-semibold">Retry</button>
            </div>
          ) : data ? (
            <>
              {tab === 'overview'     && <OverviewTab data={data} />}
              {tab === 'spend'        && <SpendTab data={data} />}
              {tab === 'productivity' && <ProductivityTab data={data} />}
              {tab === 'roi'          && <RoiTab data={data} />}
              {tab === 'manual'       && <ManualWorkTab data={data} onAdd={() => setShowAddWork(true)} onRefresh={loadData} />}
              {tab === 'prompts'      && <PromptsTab data={data} onAdd={() => {}} onRefresh={loadData} />}
            </>
          ) : null}
        </div>
      </div>

      {showAddCost && <AddCostRecordModal onClose={() => setShowAddCost(false)} onSaved={() => { setShowAddCost(false); loadData(); }} />}
      {showAddWork && <AddManualWorkModal onClose={() => setShowAddWork(false)} onSaved={() => { setShowAddWork(false); loadData(); }} />}
    </div>
  );
}
