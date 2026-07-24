import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  clearServerAccessToken,
  getServerAccessToken,
  setServerAccessToken,
} from '../../api/serverAccess';

type ProviderId = 'openai-compatible' | 'anthropic' | 'codex-cli' | 'claude-cli' | 'copilot-cli';
type AsyncState = 'idle' | 'loading' | 'success' | 'error';

interface ProviderMetadata {
  id: ProviderId;
  label: string;
  type: 'http' | 'cli';
  available: boolean;
  installed?: boolean;
  authenticated?: boolean;
  authStatus?: 'authenticated' | 'not-authenticated' | 'unknown';
  version?: string;
  unavailableReason?: string;
  capabilities: {
    probe: boolean;
    listModels: boolean;
    invoke: boolean;
    stream: boolean;
    cancel: boolean;
    provenance: boolean;
  };
}

interface LLMSettings {
  provider: ProviderId;
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;
  apiKeyConfigured: boolean;
}

type CapabilityStatus = 'available' | 'degraded' | 'unavailable' | 'unknown';

interface SystemCapability {
  id: string;
  label: string;
  status: CapabilityStatus;
  reason: string;
  checkedAt: string;
  details: Record<string, unknown>;
}

interface CapabilityReport {
  schemaVersion: number;
  checkedAt: string;
  cache: { cached: boolean; ttlMs: number };
  capabilities: SystemCapability[];
}

const PROVIDER_FALLBACKS: ProviderMetadata[] = [
  { id: 'openai-compatible', label: 'OpenAI-compatible API', type: 'http', available: true, capabilities: { probe: true, listModels: true, invoke: true, stream: true, cancel: true, provenance: true } },
  { id: 'anthropic', label: 'Anthropic API', type: 'http', available: true, capabilities: { probe: true, listModels: true, invoke: true, stream: true, cancel: true, provenance: true } },
  ...(['codex-cli', 'claude-cli', 'copilot-cli'] as const).map((id) => ({
    id,
    label: id === 'codex-cli' ? 'Codex CLI' : id === 'claude-cli' ? 'Claude Code CLI' : 'GitHub Copilot CLI',
    type: 'cli' as const,
    available: false,
    unavailableReason: 'Server status has not been loaded.',
    capabilities: { probe: true, listModels: false, invoke: true, stream: true, cancel: true, provenance: true },
  })),
];

const DEFAULT_LLM: LLMSettings = {
  provider: 'openai-compatible',
  llmEndpoint: '',
  llmApiKey: '',
  llmModel: '',
  apiKeyConfigured: false,
};

function removeCachedLLMSettings() {
  const SETTINGS_KEY = 'paper-agent-settings-v1';
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    // Never hydrate API keys from browser storage; server .env owns LLM config.
    delete parsed.llmEndpoint;
    delete parsed.llmApiKey;
    delete parsed.llmModel;
    delete parsed.llmProvider;
    if (Object.keys(parsed).length === 0) window.localStorage.removeItem(SETTINGS_KEY);
    else window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    window.localStorage.removeItem(SETTINGS_KEY);
  }
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body as T;
}

async function loadLLMSettingsFromBackend(): Promise<LLMSettings> {
  const cfg = await responseJson<Record<string, any>>(await fetch('/api/config'));
  return {
    provider: (cfg.llm_provider || 'openai-compatible') as ProviderId,
    llmEndpoint: cfg.llm_base_url || cfg.claude_base_url || '',
    llmApiKey: '',
    llmModel: cfg.llm_model || cfg.claude_model || '',
    apiKeyConfigured: Boolean(cfg.llm_api_key_set || cfg.claude_api_key_set),
  };
}

async function saveLLMSettingsToBackend(settings: LLMSettings) {
  removeCachedLLMSettings();
  const body: Record<string, string> = {
    llm_provider: settings.provider,
    llm_model: settings.llmModel,
  };
  if (settings.provider === 'openai-compatible') body.llm_base_url = settings.llmEndpoint;
  if (settings.provider === 'anthropic') {
    body.claude_base_url = settings.llmEndpoint;
    body.claude_model = settings.llmModel;
  }
  if (settings.llmApiKey) {
    if (settings.provider === 'anthropic') body.claude_api_key = settings.llmApiKey;
    else body.llm_api_key = settings.llmApiKey;
  }
  await responseJson(await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

async function probeProvider(settings: LLMSettings, usePersistedConnection = false) {
  return responseJson<Record<string, any>>(await fetch(`/api/providers/${settings.provider}/probe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(usePersistedConnection
      ? {}
      : { endpoint: settings.llmEndpoint, apiKey: settings.llmApiKey, model: settings.llmModel }),
  }));
}

interface Props {
  open: boolean;
  onClose: () => void;
  onServerAccessChanged?: (tokenApplied: boolean) => void | Promise<void>;
}

export function SettingsModal({ open, onClose, onServerAccessChanged }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<LLMSettings>(DEFAULT_LLM);
  const [persistedSettings, setPersistedSettings] = useState<LLMSettings>(DEFAULT_LLM);
  const [providers, setProviders] = useState<ProviderMetadata[]>(PROVIDER_FALLBACKS);
  const [models, setModels] = useState<string[]>([]);
  const [accessToken, setAccessToken] = useState(() => getServerAccessToken());
  const [authRequired, setAuthRequired] = useState(false);
  const [loadState, setLoadState] = useState<AsyncState>('idle');
  const [saveState, setSaveState] = useState<AsyncState>('idle');
  const [testState, setTestState] = useState<AsyncState>('idle');
  const [modelsState, setModelsState] = useState<AsyncState>('idle');
  const [message, setMessage] = useState('');
  const [probeDetails, setProbeDetails] = useState('');
  const [activeTab, setActiveTab] = useState<'provider' | 'capabilities'>('provider');
  const [capabilityReport, setCapabilityReport] = useState<CapabilityReport | null>(null);
  const [capabilityState, setCapabilityState] = useState<AsyncState>('idle');
  const [capabilityError, setCapabilityError] = useState('');

  const selectedProvider = useMemo(
    () => providers.find((provider) => provider.id === form.provider) || PROVIDER_FALLBACKS[0],
    [form.provider, providers],
  );
  const appliedServerToken = Boolean(getServerAccessToken());
  const serverAccessReady = !authRequired || appliedServerToken;
  const providerReady = selectedProvider.available;
  const credentialsReady = selectedProvider.type === 'cli'
    ? selectedProvider.available
    : Boolean(form.llmEndpoint.trim() && (form.llmApiKey.trim() || form.apiKeyConfigured));
  const connectionReady = testState === 'success';
  const usesPersistedHttpConnection = selectedProvider.type === 'http'
    && !form.llmApiKey.trim()
    && form.apiKeyConfigured
    && form.provider === persistedSettings.provider
    && form.llmEndpoint.trim() === persistedSettings.llmEndpoint.trim();

  const setupStepStyle = (ready: boolean) => ({
    border: `1px solid ${ready ? 'color-mix(in srgb, var(--success) 45%, var(--border))' : 'var(--border)'}`,
    borderRadius: 8,
    padding: '8px 10px',
    background: ready ? 'color-mix(in srgb, var(--success) 8%, var(--panel))' : 'var(--panel)',
  });

  const reload = async (): Promise<boolean> => {
    setLoadState('loading');
    setMessage('');
    try {
      const health = await responseJson<{ authRequired?: boolean }>(await fetch('/api/health'));
      setAuthRequired(Boolean(health.authRequired));
      const settingsRequest = loadLLMSettingsFromBackend();
      const providersRequest = fetch('/api/providers').then((response) => (
        responseJson<{ providers: ProviderMetadata[] }>(response)
      ));
      const [settings, metadata] = await Promise.all([
        settingsRequest,
        providersRequest,
      ]);
      setForm(settings);
      setPersistedSettings(settings);
      setProviders(metadata.providers);
      setLoadState('success');
      return true;
    } catch (error) {
      setLoadState('error');
      const rawMessage = error instanceof Error ? error.message : String(error);
      setMessage(/Authentication required|Invalid token/i.test(rawMessage)
        ? t('Apply a server access token in Provider settings to run protected diagnostics.')
        : rawMessage);
      return false;
    }
  };

  useEffect(() => {
    if (open) void reload();
  }, [open]);

  useEffect(() => {
    setModels([]);
    setModelsState('idle');
    setProbeDetails('');
    setTestState('idle');
  }, [form.provider]);

  useEffect(() => {
    // A successful probe is tied to the exact provider configuration it
    // checked. Editing an endpoint, model, or credential invalidates it.
    setProbeDetails('');
    setTestState('idle');
  }, [form.llmEndpoint, form.llmApiKey, form.llmModel, form.apiKeyConfigured]);

  if (!open) return null;

  const applyAccessToken = async () => {
    setServerAccessToken(accessToken);
    setMessage('');
    if (await reload()) await onServerAccessChanged?.(Boolean(accessToken.trim()));
  };

  const clearAccess = async () => {
    clearServerAccessToken();
    setAccessToken('');
    setProviders(PROVIDER_FALLBACKS);
    await reload();
    await onServerAccessChanged?.(false);
  };

  const testConnection = async () => {
    setTestState('loading');
    setProbeDetails('');
    try {
      if (selectedProvider.type === 'http' && !form.llmApiKey.trim() && !usesPersistedHttpConnection) {
        throw new Error(t('Re-enter the model API key after changing the provider endpoint.'));
      }
      const result = await probeProvider(form, usesPersistedHttpConnection);
      const auth = result.auth?.available === null ? 'auth status unavailable' : result.auth?.available ? 'authenticated' : 'not authenticated';
      setProbeDetails(`${result.version || form.provider} · ${auth}`);
      const installationReady = result.installed !== false;
      const configurationReady = result.configured !== false;
      const authenticationReady = selectedProvider.type !== 'cli' || result.auth?.available === true;
      setTestState(installationReady && configurationReady && authenticationReady ? 'success' : 'error');
    } catch (error) {
      setProbeDetails(error instanceof Error ? error.message : String(error));
      setTestState('error');
    }
  };

  const loadModels = async () => {
    setModelsState('loading');
    setMessage('');
    try {
      if (selectedProvider.type === 'http' && !form.llmApiKey.trim() && !usesPersistedHttpConnection) {
        throw new Error(t('Re-enter the model API key after changing the provider endpoint.'));
      }
      const request = selectedProvider.type === 'http' && form.llmApiKey.trim()
        ? fetch(`/api/providers/${form.provider}/models`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: form.llmEndpoint, apiKey: form.llmApiKey }),
          })
        : fetch(`/api/providers/${form.provider}/models`);
      const result = await responseJson<{ models: string[] }>(await request);
      setModels(result.models || []);
      setModelsState('success');
    } catch (error) {
      setModelsState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const save = async () => {
    if (!providerReady) {
      setSaveState('error');
      setMessage(t('Selected provider is not available on the server.'));
      return;
    }
    if (!credentialsReady) {
      setSaveState('error');
      setMessage(t('Provide provider credentials before saving.'));
      return;
    }
    if (testState !== 'success') {
      setSaveState('error');
      setMessage(t('Verify the provider connection before saving.'));
      return;
    }
    setSaveState('loading');
    setMessage('');
    try {
      await saveLLMSettingsToBackend(form);
      setSaveState('success');
      onClose();
    } catch (error) {
      setSaveState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const loadCapabilities = async (refresh = false) => {
    setCapabilityState('loading');
    setCapabilityError('');
    try {
      const endpoint = refresh ? '/api/capabilities?refresh=1' : '/api/capabilities';
      const report = await responseJson<CapabilityReport>(await fetch(endpoint));
      setCapabilityReport(report);
      setCapabilityState('success');
    } catch (error) {
      setCapabilityState('error');
      setCapabilityError(error instanceof Error ? error.message : String(error));
    }
  };

  const selectTab = (tab: 'provider' | 'capabilities') => {
    setActiveTab(tab);
    if (tab === 'capabilities' && capabilityState === 'idle') void loadCapabilities();
  };

  const capabilityTone = (capability: SystemCapability) => {
    if (capability.status === 'available') return 'var(--success)';
    if (capability.status === 'degraded') return '#b7791f';
    if (capability.status === 'unavailable') return 'var(--danger)';
    return 'var(--muted)';
  };

  return (
    <div className="modal-backdrop" onClick={saveState === 'loading' ? undefined : onClose}>
      <div className="modal provider-settings-modal" onClick={(event) => event.stopPropagation()} data-testid="provider-settings-modal">
        <div className="modal-header">
          <div>{t('设置')}</div>
          <button className="icon-btn" onClick={onClose} disabled={saveState === 'loading'}>✕</button>
        </div>
        <div role="tablist" aria-label={t('Settings sections')} style={{ display: 'flex', gap: 8, padding: '10px 16px 0' }}>
          <button className={`btn ghost${activeTab === 'provider' ? ' active' : ''}`} type="button" role="tab"
            aria-selected={activeTab === 'provider'} onClick={() => selectTab('provider')}>
            {t('Provider settings')}
          </button>
          <button className={`btn ghost${activeTab === 'capabilities' ? ' active' : ''}`} type="button" role="tab"
            aria-selected={activeTab === 'capabilities'} data-testid="capabilities-tab" onClick={() => selectTab('capabilities')}>
            {t('System capabilities')}
          </button>
        </div>
        <div className="modal-body">
          {activeTab === 'provider' ? <>
          <div data-testid="provider-setup-guide" style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 14, background: 'var(--panel-muted)' }}>
            <strong>{t('Quick provider setup')}</strong>
            <div style={{ color: 'var(--muted)', fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>
              {t('Server access token protects this Paper Writer server; it is not a model API key.')}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.55, marginTop: 6, fontWeight: 600 }}>
              {t('Model setup is optional; even without a model, you can open projects, edit files, and save changes manually.')}
            </div>
            <div style={{ display: 'grid', gap: 7, marginTop: 9 }}>
              <div data-testid="setup-step-server-access" style={setupStepStyle(serverAccessReady)}>
                <div style={{ fontWeight: 700 }}>{serverAccessReady ? '✓' : '1'} · {t('Unlock this Paper Writer server')}</div>
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                  {authRequired
                    ? (appliedServerToken ? t('A server access token is applied for this browser tab.') : t('Enter the server token supplied by the administrator, then apply it.'))
                    : t('This server currently reports that authentication is optional.')}
                </div>
              </div>
              <div data-testid="setup-step-provider" style={setupStepStyle(providerReady)}>
                <div style={{ fontWeight: 700 }}>{providerReady ? '✓' : '2'} · {t('Choose how the model runs')}</div>
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                  {t('HTTP providers need an API endpoint and credential. CLI providers use a server-installed, already signed-in executable.')}
                </div>
              </div>
              <div data-testid="setup-step-credentials" style={setupStepStyle(credentialsReady)}>
                <div style={{ fontWeight: 700 }}>{credentialsReady ? '✓' : '3'} · {t('Provide provider credentials')}</div>
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                  {selectedProvider.type === 'cli'
                    ? t('The server must have this CLI installed and signed in. Browser API keys are not used for CLI providers.')
                    : t('The model API key is separate from the server access token and is only used for the selected HTTP provider.')}
                </div>
                {selectedProvider.type === 'cli' && <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
                  {t('CLI providers are read-only Chat providers here; file-changing tasks require the separate reviewable Task Agent workflow.')}
                </div>}
              </div>
              <div data-testid="setup-step-connection" style={setupStepStyle(connectionReady)}>
                <div style={{ fontWeight: 700 }}>{connectionReady ? '✓' : '4'} · {t('Verify before saving')}</div>
                <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 2 }}>
                  {t('Run Test connection to verify installation, authentication, and provider reachability. The test may contact the selected provider.')}
                </div>
              </div>
            </div>
          </div>

          <div className="field">
            <label htmlFor="paper-writer-server-token">{t('Server access token')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="paper-writer-server-token" className="input" type="password" autoComplete="off" value={accessToken}
                placeholder={authRequired ? t('Required by this server') : t('Optional unless server authentication is enabled')}
                onChange={(event) => setAccessToken(event.target.value)} />
              <button className="btn ghost" type="button" onClick={() => void applyAccessToken()}>{t('Apply')}</button>
              <button className="btn ghost" type="button" onClick={() => void clearAccess()}>{t('Clear')}</button>
            </div>
            <small style={{ color: 'var(--muted)' }}>{t('Stored only for this browser tab session; never written to localStorage.')}</small>
          </div>

          <div className="field">
            <label htmlFor="paper-writer-provider">{t('Provider')}</label>
            <select id="paper-writer-provider" className="input" value={form.provider}
              onChange={(event) => setForm((previous) => ({ ...previous, provider: event.target.value as ProviderId }))}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id} disabled={!provider.available}>
                  {provider.available ? provider.label : `${provider.label} — ${t('unavailable')}`}
                </option>
              ))}
            </select>
            {selectedProvider.type === 'cli' && !selectedProvider.available && (
              <small style={{ color: 'var(--danger)' }}>{selectedProvider.unavailableReason}</small>
            )}
          </div>

          {selectedProvider.type === 'http' && <>
            <div className="field">
              <label htmlFor="paper-writer-provider-endpoint">{t('API Base URL')}</label>
              <input id="paper-writer-provider-endpoint" className="input" type="url" value={form.llmEndpoint}
                placeholder={form.provider === 'anthropic' ? 'https://api.anthropic.com/v1' : 'https://api.openai.com/v1'}
                onChange={(event) => setForm((previous) => ({ ...previous, llmEndpoint: event.target.value }))} />
            </div>
            <div className="field">
              <label htmlFor="paper-writer-provider-api-key">{t('API Key')} {form.apiKeyConfigured ? `(${t('configured')})` : ''}</label>
              <input id="paper-writer-provider-api-key" className="input" type="password" autoComplete="new-password"
                placeholder={t('Leave blank to keep existing key')} value={form.llmApiKey}
                onChange={(event) => setForm((previous) => ({ ...previous, llmApiKey: event.target.value }))} />
            </div>
          </>}

          <div className="field">
            <label htmlFor="paper-writer-provider-model">{t('Model')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input id="paper-writer-provider-model" className="input" list="provider-models" value={form.llmModel}
                placeholder={selectedProvider.type === 'cli' ? t('Blank uses the CLI default') : t('Enter or load a model')}
                onChange={(event) => setForm((previous) => ({ ...previous, llmModel: event.target.value }))} />
              {selectedProvider.capabilities.listModels && (
                <button className="btn ghost" type="button" disabled={modelsState === 'loading'} onClick={() => void loadModels()}>
                  {modelsState === 'loading' ? t('Loading...') : t('Load models')}
                </button>
              )}
            </div>
            <datalist id="provider-models">{models.map((model) => <option key={model} value={model} />)}</datalist>
            {!selectedProvider.capabilities.listModels && <small style={{ color: 'var(--muted)' }}>{t('This CLI does not provide a stable model list; enter one manually or leave blank.')}</small>}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button className="btn ghost" type="button" disabled={testState === 'loading' || !selectedProvider.available}
              onClick={() => void testConnection()}>
              {testState === 'loading' ? t('Testing...') : t('Test connection')}
            </button>
            {probeDetails && <small data-testid="provider-probe-result" role="status" style={{ color: testState === 'success' ? 'var(--success)' : 'var(--danger)' }}>{probeDetails}</small>}
          </div>
          {message && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{message}</div>}
          {loadState === 'loading' && <small>{t('Loading settings...')}</small>}
          </> : <div data-testid="capabilities-panel">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div>
                <strong>{t('System capabilities')}</strong>
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>
                  {t('Read-only diagnostics. Refresh does not install software, sign in, or call a model.')}
                </div>
              </div>
              <button className="btn ghost" type="button" disabled={capabilityState === 'loading'} onClick={() => void loadCapabilities(true)}>
                {capabilityState === 'loading' ? t('Refreshing...') : t('Refresh')}
              </button>
            </div>
            {capabilityError && <div role="alert" style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>
              {capabilityError}
              {!getServerAccessToken() && <div style={{ marginTop: 4 }}>{t('Apply a server access token in Provider settings to run protected diagnostics.')}</div>}
            </div>}
            {capabilityState === 'loading' && !capabilityReport && <small>{t('Checking capabilities...')}</small>}
            {capabilityReport && <>
              <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 10 }}>
                {t('Checked at')}: {new Date(capabilityReport.checkedAt).toLocaleString()} · {capabilityReport.cache.cached ? t('cached') : t('fresh')}
              </div>
              <div style={{ display: 'grid', gap: 8, maxHeight: '52vh', overflow: 'auto' }}>
                {capabilityReport.capabilities.map((capability) => <div key={capability.id} data-testid={`capability-${capability.id}`}
                  style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', background: 'var(--panel)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 13 }}>{capability.label}</strong>
                    <span style={{ color: capabilityTone(capability), fontWeight: 700, fontSize: 11, textTransform: 'uppercase' }}>
                      {t(capability.status)}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 4 }}>{capability.reason}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 5 }}>
                    {t('Checked at')}: {new Date(capability.checkedAt).toLocaleString()}
                  </div>
                </div>)}
              </div>
            </>}
          </div>}
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={saveState === 'loading'}>{activeTab === 'provider' ? t('取消') : t('Close')}</button>
          {activeTab === 'provider' && <button className="btn" onClick={() => void save()} disabled={saveState === 'loading' || loadState === 'loading'}>
            {saveState === 'loading' ? t('Saving...') : t('保存')}
          </button>}
        </div>
      </div>
    </div>
  );
}
