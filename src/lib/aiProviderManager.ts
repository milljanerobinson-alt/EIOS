import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProviderConfig {
  id: string;
  provider: string;
  display_name: string;
  model: string;
  is_enabled: boolean;
  is_default: boolean;
  has_api_key: boolean;
  health_status: string | null;
  health_latency_ms: number | null;
  health_checked_at: string | null;
  base_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProviderRoutingResult {
  available: boolean;
  provider: ProviderConfig | null;
  reason: string;
  routingStrategy: 'explicit' | 'default_provider' | 'fallback' | 'none';
  usedDefault: boolean;
  fallbackOccurred: boolean;
  fallbackReason?: string;
  routingTimestamp: string;
}

// ─── AI Provider Manager ──────────────────────────────────────────────────────

export const AIProviderManager = {

  async listProviders(): Promise<ProviderConfig[]> {
    const { data, error } = await supabase
      .from('ai_provider_configs')
      .select('*')
      .order('is_default', { ascending: false })
      .order('display_name');
    if (error) throw error;
    return (data ?? []) as ProviderConfig[];
  },

  async getDefaultProvider(): Promise<ProviderConfig | null> {
    const { data, error } = await supabase
      .from('ai_provider_configs')
      .select('*')
      .eq('is_default', true)
      .eq('is_enabled', true)
      .eq('has_api_key', true)
      .maybeSingle();
    if (error) throw error;
    return data as ProviderConfig | null;
  },

  async routeCapabilityRequest(
    explicitProviderConfigId?: string,
  ): Promise<ProviderRoutingResult> {
    const routingTimestamp = new Date().toISOString();
    const providers = await this.listProviders();

    // 1. Explicit provider override
    if (explicitProviderConfigId) {
      const explicit = providers.find(
        p => p.id === explicitProviderConfigId && p.is_enabled && p.has_api_key,
      );
      if (explicit) {
        return {
          available: true,
          provider: explicit,
          reason: `Routed to explicit provider: ${explicit.display_name}`,
          routingStrategy: 'explicit',
          usedDefault: false,
          fallbackOccurred: false,
          routingTimestamp,
        };
      }
      // Explicit unavailable — fall through with fallback flag
    }

    // 2. Default provider
    const defaultProvider = providers.find(
      p => p.is_default && p.is_enabled && p.has_api_key,
    );
    if (defaultProvider) {
      const fallbackOccurred = !!explicitProviderConfigId;
      return {
        available: true,
        provider: defaultProvider,
        reason: fallbackOccurred
          ? `Explicit provider unavailable; fell back to default: ${defaultProvider.display_name}`
          : `Routed to default provider: ${defaultProvider.display_name}`,
        routingStrategy: fallbackOccurred ? 'fallback' : 'default_provider',
        usedDefault: true,
        fallbackOccurred,
        fallbackReason: fallbackOccurred
          ? `Explicit provider config ${explicitProviderConfigId} unavailable or disabled`
          : undefined,
        routingTimestamp,
      };
    }

    // 3. Any enabled provider
    const anyProvider = providers.find(p => p.is_enabled && p.has_api_key);
    if (anyProvider) {
      return {
        available: true,
        provider: anyProvider,
        reason: `No default provider — fell back to: ${anyProvider.display_name}`,
        routingStrategy: 'fallback',
        usedDefault: false,
        fallbackOccurred: true,
        fallbackReason: 'No default provider configured',
        routingTimestamp,
      };
    }

    return {
      available: false,
      provider: null,
      reason: 'No AI provider configured. Go to AI Infrastructure → Providers to add one.',
      routingStrategy: 'none',
      usedDefault: false,
      fallbackOccurred: false,
      routingTimestamp,
    };
  },

  isProviderHealthy(provider: ProviderConfig): boolean {
    return provider.health_status === 'healthy';
  },

  getProviderDisplayInfo(providerKey: string): { label: string; colour: string } {
    const map: Record<string, { label: string; colour: string }> = {
      openai:    { label: 'OpenAI',    colour: 'text-emerald-600' },
      anthropic: { label: 'Anthropic', colour: 'text-orange-600'  },
      gemini:    { label: 'Gemini',    colour: 'text-blue-600'    },
    };
    return map[providerKey] ?? { label: providerKey, colour: 'text-slate-600' };
  },
};
