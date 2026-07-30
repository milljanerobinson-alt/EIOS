import { useEffect, useState, useCallback } from 'react';
import {
  Building2, KeyRound, Mail, Brain, Bell, Save, Loader2,
  CheckCircle2, AlertCircle, X, Eye, EyeOff, Plug, Image,
  ShieldCheck, RefreshCw, Webhook, Copy, Check, Zap,
  BarChart2, TrendingUp, Clock, DollarSign, Activity,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token || ''}`,
    'Content-Type': 'application/json',
    'Apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

// ── AI Provider types ──────────────────────────────────────────────────────

const AI_PROVIDERS = [
  { value: 'openai',    label: 'OpenAI',    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'anthropic', label: 'Anthropic', models: ['claude-opus-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] },
];

interface AIProviderConfig {
  provider: string;
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  requestTimeout: number;
  retryCount: number;
  dailyUsageLimit: number;
}

interface AIUsageStat {
  feature: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  estimated_cost_usd: number;
  duration_ms: number;
  success: boolean;
  cache_hit: boolean;
  created_at: string;
}

const DEFAULT_AI_CONFIG: AIProviderConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 4096,
  requestTimeout: 30,
  retryCount: 2,
  dailyUsageLimit: 0,
};

// ─────────────────────────────────────────────────────────────────────────────

interface OrgBranding {
  name: string;
  rto_number: string;
  logo_url: string;
  app_url: string;
}

interface AxcelerateConfig {
  api_base_url: string;
  timezone?: string;
}

const TIMEZONE_OPTIONS = [
  { value: 'Australia/Sydney',    label: 'Australia/Sydney (AEST/AEDT)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (AEST/AEDT)' },
  { value: 'Australia/Brisbane',  label: 'Australia/Brisbane (AEST)' },
  { value: 'Australia/Adelaide',  label: 'Australia/Adelaide (ACST/ACDT)' },
  { value: 'Australia/Darwin',    label: 'Australia/Darwin (ACST)' },
  { value: 'Australia/Perth',     label: 'Australia/Perth (AWST)' },
  { value: 'Australia/Hobart',    label: 'Australia/Hobart (AEST/AEDT)' },
  { value: 'Pacific/Auckland',    label: 'Pacific/Auckland (NZST/NZDT)' },
  { value: 'UTC',                 label: 'UTC' },
];

interface NotificationSettings {
  sent: boolean;
  reminder: boolean;
  completed: boolean;
  overdue: boolean;
  trainer_review: boolean;
  intervention: boolean;
  support_plan: boolean;
}

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

const DEFAULT_BRANDING: OrgBranding = {
  name: '',
  rto_number: '',
  logo_url: '',
  app_url: '',
};

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  sent: true,
  reminder: true,
  completed: true,
  overdue: true,
  trainer_review: true,
  intervention: true,
  support_plan: true,
};

const NOTIFICATION_TYPES: { key: keyof NotificationSettings; label: string; description: string }[] = [
  { key: 'sent', label: 'Assessment Sent', description: 'Notify when an assessment invitation is sent to a candidate.' },
  { key: 'reminder', label: 'Reminder', description: 'Notify when a reminder is sent to a candidate.' },
  { key: 'completed', label: 'Assessment Completed', description: 'Notify when a candidate completes their assessment.' },
  { key: 'overdue', label: 'Overdue', description: 'Notify when an assessment becomes overdue.' },
  { key: 'trainer_review', label: 'Trainer Review Required', description: 'Notify when a result requires trainer review.' },
  { key: 'intervention', label: 'Intervention Triggered', description: 'Notify when an intervention case is opened.' },
  { key: 'support_plan', label: 'Support Plan Created', description: 'Notify when a support plan is created or updated.' },
];

export function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [branding, setBranding] = useState<OrgBranding>(DEFAULT_BRANDING);
  const [savingBranding, setSavingBranding] = useState(false);

  const [axcelerateConfig, setAxcelerateConfig] = useState<AxcelerateConfig>({ api_base_url: '' });
  const [axcelerateApiToken, setAxcelerateApiToken] = useState('');
  const [axcelerateWsToken, setAxcelerateWsToken] = useState('');
  const [savedApiTokenValue, setSavedApiTokenValue] = useState('');
  const [savedWsTokenValue, setSavedWsTokenValue] = useState('');
  const [apiTokenSaved, setApiTokenSaved] = useState(false);
  const [wsTokenSaved, setWsTokenSaved] = useState(false);
  const [editingApiToken, setEditingApiToken] = useState(false);
  const [editingWsToken, setEditingWsToken] = useState(false);
  const [savingAxcelerate, setSavingAxcelerate] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [showApiToken, setShowApiToken] = useState(false);
  const [showWsToken, setShowWsToken] = useState(false);

  // Webhook secret
  const [webhookSecret, setWebhookSecret] = useState('');
  const [generatingSecret, setGeneratingSecret] = useState(false);
  const [copiedWebhookUrl, setCopiedWebhookUrl] = useState(false);

  const [emailApiKey, setEmailApiKey] = useState('');
  const [reminderPeriodDays, setReminderPeriodDays] = useState(7);
  const [overdueThresholdDays, setOverdueThresholdDays] = useState(14);
  const [savingEmail, setSavingEmail] = useState(false);
  const [showEmailKey, setShowEmailKey] = useState(false);

  const [llmApiKey, setLlmApiKey] = useState('');
  const [aiConfig, setAiConfig] = useState<AIProviderConfig>(DEFAULT_AI_CONFIG);
  const [savingAi, setSavingAi] = useState(false);
  const [showLlmKey, setShowLlmKey] = useState(false);
  const [aiKeySaved, setAiKeySaved] = useState(false);
  const [editingAiKey, setEditingAiKey] = useState(false);
  const [aiUsage, setAiUsage] = useState<AIUsageStat[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const [notifications, setNotifications] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS);
  const [savingNotifications, setSavingNotifications] = useState(false);

  const showToast = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    const { data, error } = await supabase.from('settings').select('*');

    if (error) {
      showToast('error', 'Failed to load settings.');
      setLoading(false);
      return;
    }

    const settingsMap: Record<string, any> = {};
    (data || []).forEach((row) => {
      settingsMap[row.key] = row.value;
    });

    if (settingsMap.org_branding) {
      setBranding({
        name: settingsMap.org_branding.name || '',
        rto_number: settingsMap.org_branding.rto_number || '',
        logo_url: settingsMap.org_branding.logo_url || '',
        app_url: settingsMap.org_branding.app_url || '',
      });
    }

    if (settingsMap.axcelerate_config) {
      setAxcelerateConfig({
        api_base_url: settingsMap.axcelerate_config.api_base_url || '',
        timezone: settingsMap.axcelerate_config.timezone || 'Australia/Sydney',
      });
      setApiTokenSaved(!!settingsMap.axcelerate_config.api_token_saved);
      setWsTokenSaved(!!settingsMap.axcelerate_config.ws_token_saved);
    }

    if (typeof settingsMap.axcelerate_api_token === 'string') {
      setSavedApiTokenValue(settingsMap.axcelerate_api_token);
      setApiTokenSaved(true);
    }
    if (typeof settingsMap.axcelerate_ws_token === 'string') {
      setSavedWsTokenValue(settingsMap.axcelerate_ws_token);
      setWsTokenSaved(true);
    }

    if (typeof settingsMap.axcelerate_auto_sync === 'boolean') {
      // retained for backwards compatibility, no longer shown in UI
    }

    if (typeof settingsMap.axcelerate_webhook_secret === 'string' && settingsMap.axcelerate_webhook_secret) {
      setWebhookSecret(settingsMap.axcelerate_webhook_secret);
    }

    if (settingsMap.reminder_period_days != null) {
      setReminderPeriodDays(Number(settingsMap.reminder_period_days));
    }

    if (settingsMap.overdue_threshold_days != null) {
      setOverdueThresholdDays(Number(settingsMap.overdue_threshold_days));
    }

    if (settingsMap.ai_model) {
      setAiConfig((prev) => ({ ...prev, model: settingsMap.ai_model }));
    }
    if (settingsMap.ai_provider) {
      setAiConfig((prev) => ({ ...prev, provider: settingsMap.ai_provider }));
    }
    if (settingsMap.llm_base_url) {
      setAiConfig((prev) => ({ ...prev, baseUrl: settingsMap.llm_base_url }));
    }
    if (settingsMap.ai_temperature != null) {
      setAiConfig((prev) => ({ ...prev, temperature: parseFloat(settingsMap.ai_temperature) || 0.7 }));
    }
    if (settingsMap.ai_max_tokens != null) {
      setAiConfig((prev) => ({ ...prev, maxTokens: parseInt(settingsMap.ai_max_tokens) || 4096 }));
    }
    if (settingsMap.ai_request_timeout != null) {
      setAiConfig((prev) => ({ ...prev, requestTimeout: parseInt(settingsMap.ai_request_timeout) || 30 }));
    }
    if (settingsMap.ai_retry_count != null) {
      setAiConfig((prev) => ({ ...prev, retryCount: parseInt(settingsMap.ai_retry_count) || 2 }));
    }
    if (settingsMap.ai_daily_usage_limit != null) {
      setAiConfig((prev) => ({ ...prev, dailyUsageLimit: parseInt(settingsMap.ai_daily_usage_limit) || 0 }));
    }
    // Check if a key has previously been saved
    if (settingsMap.llm_api_key) {
      setAiKeySaved(true);
    }

    if (settingsMap.notification_settings) {
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...settingsMap.notification_settings });
    }

    setLoading(false);
  }

  async function upsertSetting(key: string, value: any) {
    const { error } = await supabase
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
  }

  async function handleSaveBranding() {
    setSavingBranding(true);
    try {
      await upsertSetting('org_branding', branding);
      showToast('success', 'Organisation branding saved successfully.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save branding.');
    } finally {
      setSavingBranding(false);
    }
  }

  async function handleSaveAxcelerate() {
    setSavingAxcelerate(true);
    try {
      const newApiTokenSaved = apiTokenSaved || !!axcelerateApiToken;
      const newWsTokenSaved = wsTokenSaved || !!axcelerateWsToken;

      await upsertSetting('axcelerate_config', {
        api_base_url: axcelerateConfig.api_base_url,
        timezone: axcelerateConfig.timezone || 'Australia/Sydney',
        api_token_saved: newApiTokenSaved,
        ws_token_saved: newWsTokenSaved,
      });

      if (axcelerateApiToken || axcelerateWsToken) {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-axcelerate-secrets`;
        const headers = await getAuthHeaders();
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            api_token: axcelerateApiToken,
            ws_token: axcelerateWsToken,
          }),
        });

        if (!response.ok) {
          const text = await response.text();
          let message = `Edge function returned ${response.status}`;
          try {
            const json = JSON.parse(text);
            if (json.error) message = json.error;
          } catch {
            if (text) message = text;
          }
          throw new Error(message);
        }

        if (axcelerateApiToken) {
          setApiTokenSaved(true);
          setSavedApiTokenValue(axcelerateApiToken);
          setEditingApiToken(false);
        }
        if (axcelerateWsToken) {
          setWsTokenSaved(true);
          setSavedWsTokenValue(axcelerateWsToken);
          setEditingWsToken(false);
        }
        setAxcelerateApiToken('');
        setAxcelerateWsToken('');
      }

      showToast('success', 'aXcelerate configuration saved successfully.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save aXcelerate configuration.');
    } finally {
      setSavingAxcelerate(false);
    }
  }

  async function handleGenerateSecret() {
    setGeneratingSecret(true);
    try {
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const secret = Array.from(array).map((b) => b.toString(16).padStart(2, '0')).join('');
      await upsertSetting('axcelerate_webhook_secret', secret);
      setWebhookSecret(secret);
      showToast('success', 'Webhook secret generated and saved.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to generate secret.');
    } finally {
      setGeneratingSecret(false);
    }
  }

  async function handleCopyWebhookUrl() {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/axcelerate-contact-webhook?secret=${webhookSecret}`;
    await navigator.clipboard.writeText(url);
    setCopiedWebhookUrl(true);
    setTimeout(() => setCopiedWebhookUrl(false), 2000);
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-axcelerate-connection`;
      const headers = await getAuthHeaders();
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ api_base_url: axcelerateConfig.api_base_url }),
      });

      if (!response.ok) {
        const text = await response.text();
        let message = `Connection failed (${response.status})`;
        try {
          const json = JSON.parse(text);
          if (json.error) message = json.error;
        } catch {
          if (text) message = text;
        }
        throw new Error(message);
      }

      const data = await response.json();
      if (data.success) {
        showToast('success', 'aXcelerate connection test successful.');
      } else {
        throw new Error(data.message || 'Connection test failed.');
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to test aXcelerate connection.');
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleSaveEmail() {
    setSavingEmail(true);
    try {
      await upsertSetting('reminder_period_days', reminderPeriodDays);
      await upsertSetting('overdue_threshold_days', overdueThresholdDays);

      if (emailApiKey) {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-email-secret`;
        const headers = await getAuthHeaders();
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ api_key: emailApiKey }),
        });

        if (!response.ok) {
          const text = await response.text();
          let message = `Edge function returned ${response.status}`;
          try {
            const json = JSON.parse(text);
            if (json.error) message = json.error;
          } catch {
            if (text) message = text;
          }
          throw new Error(message);
        }

        setEmailApiKey('');
      }

      showToast('success', 'Email configuration saved successfully.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save email configuration.');
    } finally {
      setSavingEmail(false);
    }
  }

  async function loadAiUsage() {
    setLoadingUsage(true);
    const { data } = await supabase
      .from('ai_usage_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setAiUsage((data || []) as AIUsageStat[]);
    setLoadingUsage(false);
  }

  async function handleSaveAi() {
    setSavingAi(true);
    try {
      // Save non-secret config fields to settings table
      await Promise.all([
        upsertSetting('ai_provider',          aiConfig.provider),
        upsertSetting('ai_model',             aiConfig.model),
        upsertSetting('llm_base_url',         aiConfig.baseUrl),
        upsertSetting('ai_temperature',       String(aiConfig.temperature)),
        upsertSetting('ai_max_tokens',        String(aiConfig.maxTokens)),
        upsertSetting('ai_request_timeout',   String(aiConfig.requestTimeout)),
        upsertSetting('ai_retry_count',       String(aiConfig.retryCount)),
        upsertSetting('ai_daily_usage_limit', String(aiConfig.dailyUsageLimit)),
        // Keep llm_model in sync for legacy consumers
        upsertSetting('llm_model', aiConfig.model),
      ]);

      // Save API key via edge function (server-side secret storage)
      if (llmApiKey) {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-llm-secret`;
        const headers = await getAuthHeaders();
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ api_key: llmApiKey, model: aiConfig.model, base_url: aiConfig.baseUrl }),
        });

        if (!response.ok) {
          const text = await response.text();
          let message = `Edge function returned ${response.status}`;
          try { const json = JSON.parse(text); if (json.error) message = json.error; } catch { if (text) message = text; }
          throw new Error(message);
        }

        setLlmApiKey('');
        setAiKeySaved(true);
        setEditingAiKey(false);
      }

      showToast('success', 'AI provider configuration saved.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save AI configuration.');
    } finally {
      setSavingAi(false);
    }
  }

  async function handleSaveNotifications() {
    setSavingNotifications(true);
    try {
      await upsertSetting('notification_settings', notifications);
      showToast('success', 'Notification settings saved successfully.');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save notification settings.');
    } finally {
      setSavingNotifications(false);
    }
  }

  function toggleNotification(key: keyof NotificationSettings) {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Organisation Settings</h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage your organisation profile, integrations, and platform configuration.
          </p>
        </div>
        <button
          onClick={loadSettings}
          className="btn-secondary"
          title="Reload settings"
        >
          <RefreshCw className="w-4 h-4" />
          Reload
        </button>
      </div>

      <SectionCard
        icon={Building2}
        title="Organisation Branding"
        description="Configure your organisation identity displayed across the platform."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Organisation Name</label>
            <input
              type="text"
              className="input"
              value={branding.name}
              onChange={(e) => setBranding({ ...branding, name: e.target.value })}
              placeholder="e.g. ABC Training College"
            />
          </div>
          <div>
            <label className="label">RTO Number</label>
            <input
              type="text"
              className="input"
              value={branding.rto_number}
              onChange={(e) => setBranding({ ...branding, rto_number: e.target.value })}
              placeholder="e.g. 12345"
            />
          </div>
          <div className="md:col-span-2">
            <label className="label">Logo URL</label>
            <input
              type="text"
              className="input"
              value={branding.logo_url}
              onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
              placeholder="https://example.com/logo.png"
            />
          </div>
        </div>

        {branding.logo_url && (
          <div className="mt-4 p-4 rounded-lg border border-slate-200 bg-slate-50">
            <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
              <Image className="w-3.5 h-3.5" />
              Logo Preview
            </div>
            <img
              src={branding.logo_url}
              alt="Organisation logo"
              className="max-h-20 max-w-xs object-contain rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button
            onClick={handleSaveBranding}
            disabled={savingBranding}
            className="btn-primary"
          >
            {savingBranding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Branding
          </button>
        </div>
      </SectionCard>

      <SectionCard
        icon={KeyRound}
        title="aXcelerate Integration"
        description="Connect your aXcelerate account for automatic candidate and course syncing."
      >
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="label">API Base URL</label>
            <input
              type="text"
              className="input"
              value={axcelerateConfig.api_base_url}
              onChange={(e) => setAxcelerateConfig({ ...axcelerateConfig, api_base_url: e.target.value })}
              placeholder="https://mydomain.axcelerate.com/api"
            />
          </div>

          <div>
            <label className="label">Account Timezone</label>
            <select
              className="input"
              value={axcelerateConfig.timezone || 'Australia/Sydney'}
              onChange={(e) => setAxcelerateConfig({ ...axcelerateConfig, timezone: e.target.value })}
            >
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Used to display timestamps in contact notes written to aXcelerate.</p>
          </div>

          <div>
            <label className="label">API Token</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {apiTokenSaved && !editingApiToken ? (
                  <input
                    type={showApiToken ? 'text' : 'password'}
                    className="input pr-10 bg-slate-50 w-full font-mono text-sm"
                    value={savedApiTokenValue || 'Re-save credentials to enable preview'}
                    readOnly
                    tabIndex={-1}
                  />
                ) : (
                  <input
                    type={showApiToken ? 'text' : 'password'}
                    className="input pr-10 w-full"
                    value={axcelerateApiToken}
                    onChange={(e) => setAxcelerateApiToken(e.target.value)}
                    placeholder="Enter your aXcelerate API token"
                    autoFocus={editingApiToken}
                  />
                )}
                <button
                  type="button"
                  onClick={() => savedApiTokenValue && setShowApiToken(!showApiToken)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${savedApiTokenValue ? 'text-slate-400 hover:text-slate-600 cursor-pointer' : 'text-slate-300 cursor-default'}`}
                  disabled={!savedApiTokenValue && apiTokenSaved && !editingApiToken}
                  title={savedApiTokenValue ? undefined : 'Re-save credentials to enable preview'}
                >
                  {showApiToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {apiTokenSaved && !editingApiToken ? (
                <button
                  type="button"
                  onClick={() => { setEditingApiToken(true); setAxcelerateApiToken(''); setShowApiToken(false); }}
                  className="btn-secondary text-xs shrink-0"
                >
                  Change
                </button>
              ) : editingApiToken ? (
                <button
                  type="button"
                  onClick={() => { setEditingApiToken(false); setAxcelerateApiToken(''); setShowApiToken(false); }}
                  className="btn-secondary text-xs shrink-0"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <div>
            <label className="label">WS Token</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                {wsTokenSaved && !editingWsToken ? (
                  <input
                    type={showWsToken ? 'text' : 'password'}
                    className="input pr-10 bg-slate-50 w-full font-mono text-sm"
                    value={savedWsTokenValue || 'Re-save credentials to enable preview'}
                    readOnly
                    tabIndex={-1}
                  />
                ) : (
                  <input
                    type={showWsToken ? 'text' : 'password'}
                    className="input pr-10 w-full"
                    value={axcelerateWsToken}
                    onChange={(e) => setAxcelerateWsToken(e.target.value)}
                    placeholder="Enter your aXcelerate WS token"
                    autoFocus={editingWsToken}
                  />
                )}
                <button
                  type="button"
                  onClick={() => savedWsTokenValue && setShowWsToken(!showWsToken)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 transition-colors ${savedWsTokenValue ? 'text-slate-400 hover:text-slate-600 cursor-pointer' : 'text-slate-300 cursor-default'}`}
                  disabled={!savedWsTokenValue && wsTokenSaved && !editingWsToken}
                  title={savedWsTokenValue ? undefined : 'Re-save credentials to enable preview'}
                >
                  {showWsToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {wsTokenSaved && !editingWsToken ? (
                <button
                  type="button"
                  onClick={() => { setEditingWsToken(true); setAxcelerateWsToken(''); setShowWsToken(false); }}
                  className="btn-secondary text-xs shrink-0"
                >
                  Change
                </button>
              ) : editingWsToken ? (
                <button
                  type="button"
                  onClick={() => { setEditingWsToken(false); setAxcelerateWsToken(''); setShowWsToken(false); }}
                  className="btn-secondary text-xs shrink-0"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </div>

          <SecretNote message="API and WS tokens are stored in your database and used by edge functions. Only admins can access them." />

          {/* Webhook section */}
          <div className="mt-2 pt-5 border-t border-slate-200">
            <div className="flex items-center gap-2 mb-3">
              <Webhook className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-900">Automatic Webhook</h4>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                <Zap className="w-3 h-3" />
                Auto-sync
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Configure this URL as a webhook in aXcelerate (Contacts &rarr; Webhooks). When a contact's custom
              fields are updated, aXcelerate will POST to this endpoint and the portal will automatically create
              the assessment invitation — no manual sync required.
            </p>

            {webhookSecret ? (
              <div className="space-y-3">
                <div>
                  <label className="label">Webhook URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      className="input font-mono text-xs bg-slate-50 flex-1"
                      value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/axcelerate-contact-webhook?secret=${webhookSecret}`}
                    />
                    <button
                      type="button"
                      onClick={handleCopyWebhookUrl}
                      className="btn-secondary shrink-0 flex items-center gap-1.5 text-xs"
                      title="Copy webhook URL"
                    >
                      {copiedWebhookUrl ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      {copiedWebhookUrl ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    The secret is embedded in the URL. Keep this URL private.
                  </p>
                </div>

                <div className="rounded-lg bg-blue-50 border border-blue-200 p-3.5 space-y-1.5 text-xs text-blue-800">
                  <p className="font-semibold">Setup instructions</p>
                  <ol className="list-decimal list-inside space-y-1 text-blue-700">
                    <li>In aXcelerate go to <strong>Admin &rarr; System &rarr; Webhooks</strong></li>
                    <li>Create a new webhook and paste the URL above</li>
                    <li>Set the trigger to <strong>Contact Updated</strong> (or custom field update)</li>
                    <li>Ensure the payload includes <code className="bg-blue-100 px-1 rounded">contactID</code> and optionally <code className="bg-blue-100 px-1 rounded">courseID</code></li>
                    <li>Save — aXcelerate will now auto-create candidates when <code className="bg-blue-100 px-1 rounded">lln_quiz_required</code> or <code className="bg-blue-100 px-1 rounded">digital_quiz_required</code> is set to <strong>Yes</strong></li>
                  </ol>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateSecret}
                  disabled={generatingSecret}
                  className="btn-ghost text-xs flex items-center gap-1.5"
                >
                  {generatingSecret ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Regenerate Secret
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerateSecret}
                disabled={generatingSecret}
                className="btn-secondary flex items-center gap-2"
              >
                {generatingSecret ? <Loader2 className="w-4 h-4 animate-spin" /> : <Webhook className="w-4 h-4" />}
                Generate Webhook URL
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-5">
          <button
            onClick={handleTestConnection}
            disabled={testingConnection}
            className="btn-secondary"
          >
            {testingConnection ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plug className="w-4 h-4" />
            )}
            Test Connection
          </button>
          <button
            onClick={handleSaveAxcelerate}
            disabled={savingAxcelerate}
            className="btn-primary"
          >
            {savingAxcelerate ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Credentials
          </button>
        </div>
      </SectionCard>

      <SectionCard
        icon={Mail}
        title="Email Configuration"
        description="Configure email notifications and reminder schedules for candidates."
      >
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="label">Email Provider API Key</label>
            <div className="relative">
              <input
                type={showEmailKey ? 'text' : 'password'}
                className="input pr-10"
                value={emailApiKey}
                onChange={(e) => setEmailApiKey(e.target.value)}
                placeholder="Enter your email provider API key"
              />
              <button
                type="button"
                onClick={() => setShowEmailKey(!showEmailKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showEmailKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <SecretNote message="The email provider API key is stored securely as an edge function secret." />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Reminder Period (days)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={reminderPeriodDays}
                onChange={(e) => setReminderPeriodDays(Math.max(1, Number(e.target.value)))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Send reminders this many days before the due date.
              </p>
            </div>
            <div>
              <label className="label">Overdue Threshold (days)</label>
              <input
                type="number"
                min={1}
                className="input"
                value={overdueThresholdDays}
                onChange={(e) => setOverdueThresholdDays(Math.max(1, Number(e.target.value)))}
              />
              <p className="text-xs text-slate-500 mt-1">
                Mark assessments as overdue after this many days past the due date.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button
            onClick={handleSaveEmail}
            disabled={savingEmail}
            className="btn-primary"
          >
            {savingEmail ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Email Settings
          </button>
        </div>
      </SectionCard>

      <SectionCard
        icon={Brain}
        title="AI Provider"
        description="Platform-managed AI configuration. Customers never need their own API keys — every AI feature uses this configuration."
      >
        {/* Provider + Model row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Provider</label>
            <select
              className="input"
              value={aiConfig.provider}
              onChange={(e) => {
                const p = AI_PROVIDERS.find((x) => x.value === e.target.value);
                setAiConfig((prev) => ({
                  ...prev,
                  provider: e.target.value,
                  model: p?.models[0] ?? prev.model,
                }));
              }}
            >
              {AI_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Model</label>
            <div className="flex gap-2">
              <select
                className="input flex-1"
                value={aiConfig.model}
                onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
              >
                {(AI_PROVIDERS.find((p) => p.value === aiConfig.provider)?.models ?? []).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 mt-1">Select from presets or type a custom model ID below.</p>
            <input
              type="text"
              className="input mt-2"
              value={aiConfig.model}
              onChange={(e) => setAiConfig((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="Custom model ID (e.g. gpt-4o-2024-11-20)"
            />
          </div>
        </div>

        {/* API Key */}
        <div className="mt-4">
          <label className="label">API Key</label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              {aiKeySaved && !editingAiKey ? (
                <input
                  type="password"
                  className="input bg-slate-50 w-full font-mono text-sm"
                  value="••••••••••••••••••••••••••••••••"
                  readOnly
                  tabIndex={-1}
                />
              ) : (
                <input
                  type={showLlmKey ? 'text' : 'password'}
                  className="input pr-10 w-full"
                  value={llmApiKey}
                  onChange={(e) => setLlmApiKey(e.target.value)}
                  placeholder={`Enter your ${AI_PROVIDERS.find((p) => p.value === aiConfig.provider)?.label ?? 'AI provider'} API key`}
                  autoFocus={editingAiKey}
                />
              )}
              {(!aiKeySaved || editingAiKey) && (
                <button
                  type="button"
                  onClick={() => setShowLlmKey(!showLlmKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showLlmKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              )}
            </div>
            {aiKeySaved && !editingAiKey ? (
              <button
                type="button"
                onClick={() => { setEditingAiKey(true); setLlmApiKey(''); setShowLlmKey(false); }}
                className="btn-secondary text-xs shrink-0"
              >
                Change
              </button>
            ) : editingAiKey ? (
              <button
                type="button"
                onClick={() => { setEditingAiKey(false); setLlmApiKey(''); setShowLlmKey(false); }}
                className="btn-secondary text-xs shrink-0"
              >
                Cancel
              </button>
            ) : null}
          </div>
        </div>

        <SecretNote message="The API key is stored as a secure edge function secret — never in the browser, never in network requests, never logged." />

        {/* Custom base URL */}
        <div className="mt-4">
          <label className="label">Custom Base URL <span className="text-slate-400 font-normal">(optional)</span></label>
          <input
            type="text"
            className="input"
            value={aiConfig.baseUrl}
            onChange={(e) => setAiConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
            placeholder="Leave blank to use the provider default endpoint"
          />
          <p className="text-xs text-slate-500 mt-1">Use for Azure OpenAI, proxies, or self-hosted models.</p>
        </div>

        {/* Advanced settings */}
        <div className="mt-5 pt-5 border-t border-slate-200">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">Advanced Settings</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Temperature</label>
              <input
                type="number"
                min={0} max={2} step={0.1}
                className="input"
                value={aiConfig.temperature}
                onChange={(e) => setAiConfig((prev) => ({ ...prev, temperature: parseFloat(e.target.value) || 0.7 }))}
              />
              <p className="text-xs text-slate-500 mt-1">0 = deterministic, 2 = creative</p>
            </div>
            <div>
              <label className="label">Max Tokens</label>
              <input
                type="number"
                min={256} max={128000} step={256}
                className="input"
                value={aiConfig.maxTokens}
                onChange={(e) => setAiConfig((prev) => ({ ...prev, maxTokens: parseInt(e.target.value) || 4096 }))}
              />
            </div>
            <div>
              <label className="label">Request Timeout (s)</label>
              <input
                type="number"
                min={5} max={120}
                className="input"
                value={aiConfig.requestTimeout}
                onChange={(e) => setAiConfig((prev) => ({ ...prev, requestTimeout: parseInt(e.target.value) || 30 }))}
              />
            </div>
            <div>
              <label className="label">Retry Count</label>
              <input
                type="number"
                min={0} max={5}
                className="input"
                value={aiConfig.retryCount}
                onChange={(e) => setAiConfig((prev) => ({ ...prev, retryCount: parseInt(e.target.value) || 2 }))}
              />
              <p className="text-xs text-slate-500 mt-1">Retries on transient errors</p>
            </div>
            <div>
              <label className="label">Daily Usage Limit</label>
              <input
                type="number"
                min={0}
                className="input"
                value={aiConfig.dailyUsageLimit}
                onChange={(e) => setAiConfig((prev) => ({ ...prev, dailyUsageLimit: parseInt(e.target.value) || 0 }))}
              />
              <p className="text-xs text-slate-500 mt-1">0 = unlimited</p>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={handleSaveAi} disabled={savingAi} className="btn-primary">
            {savingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save AI Provider
          </button>
        </div>

        {/* Usage panel */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-slate-500" />
              <h4 className="text-sm font-semibold text-slate-800">Usage Log</h4>
              <span className="text-xs text-slate-400">(last 100 requests)</span>
            </div>
            <button
              onClick={loadAiUsage}
              disabled={loadingUsage}
              className="btn-ghost text-xs flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingUsage ? 'animate-spin' : ''}`} />
              Load
            </button>
          </div>

          {aiUsage.length > 0 && (
            <>
              {/* Summary stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  {
                    icon: Activity,
                    label: 'Total Requests',
                    value: aiUsage.length,
                    color: 'text-slate-700',
                  },
                  {
                    icon: CheckCircle2,
                    label: 'Success Rate',
                    value: `${Math.round((aiUsage.filter((r) => r.success).length / aiUsage.length) * 100)}%`,
                    color: 'text-emerald-600',
                  },
                  {
                    icon: Zap,
                    label: 'Cache Hits',
                    value: aiUsage.filter((r) => r.cache_hit).length,
                    color: 'text-blue-600',
                  },
                  {
                    icon: DollarSign,
                    label: 'Est. Cost (USD)',
                    value: `$${aiUsage.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0).toFixed(4)}`,
                    color: 'text-amber-600',
                  },
                ].map(({ icon: Icon, label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon className={`w-3.5 h-3.5 ${color}`} />
                      <span className="text-xs text-slate-500">{label}</span>
                    </div>
                    <p className={`text-lg font-bold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Usage table */}
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Feature</th>
                        <th className="text-left px-3 py-2 font-semibold text-slate-600">Model</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600">Tokens</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600">Cost</th>
                        <th className="text-right px-3 py-2 font-semibold text-slate-600 hidden sm:table-cell">Duration</th>
                        <th className="text-center px-3 py-2 font-semibold text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {aiUsage.slice(0, 20).map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-700 font-medium">{row.feature}</td>
                          <td className="px-3 py-2 text-slate-500">{row.model}</td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {(row.prompt_tokens + row.completion_tokens).toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right text-amber-600">
                            ${(row.estimated_cost_usd ?? 0).toFixed(5)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500 hidden sm:table-cell">
                            {row.duration_ms}ms
                          </td>
                          <td className="px-3 py-2 text-center">
                            {row.cache_hit ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                <Zap className="w-2.5 h-2.5" />cached
                              </span>
                            ) : row.success ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="w-2.5 h-2.5" />ok
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                <AlertCircle className="w-2.5 h-2.5" />fail
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {aiUsage.length > 20 && (
                  <div className="px-3 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-200">
                    Showing 20 of {aiUsage.length} records
                  </div>
                )}
              </div>
            </>
          )}

          {aiUsage.length === 0 && !loadingUsage && (
            <div className="text-center py-8 text-slate-400">
              <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Click Load to view recent AI usage.</p>
            </div>
          )}
          {loadingUsage && (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Loading usage data…
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        icon={Bell}
        title="Notification Settings"
        description="Choose which events trigger notifications across the platform."
      >
        <div className="space-y-2">
          {NOTIFICATION_TYPES.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between p-3.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{item.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{item.description}</div>
              </div>
              <Toggle
                checked={notifications[item.key]}
                onChange={() => toggleNotification(item.key)}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-5">
          <button
            onClick={handleSaveNotifications}
            disabled={savingNotifications}
            className="btn-primary"
          >
            {savingNotifications ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Notifications
          </button>
        </div>
      </SectionCard>

      <div className="fixed bottom-6 right-6 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg border min-w-[300px] max-w-md animate-fade-in ${
              toast.type === 'success'
                ? 'bg-white border-emerald-200'
                : 'bg-white border-rose-200'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            )}
            <p className="text-sm text-slate-700 flex-1">{toast.message}</p>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-slate-400 hover:text-slate-600 flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

interface SectionCardProps {
  icon: typeof Building2;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SectionCard({ icon: Icon, title, description, children }: SectionCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary-600" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-primary-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function SecretNote({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 rounded-lg bg-primary-50 border border-primary-100">
      <ShieldCheck className="w-4 h-4 text-primary-600 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-primary-700">{message}</p>
    </div>
  );
}
