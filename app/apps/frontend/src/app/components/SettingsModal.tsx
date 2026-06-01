import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LLMSettings {
  llmEndpoint: string;
  llmApiKey: string;
  llmModel: string;
}

const DEFAULT_LLM: LLMSettings = {
  llmEndpoint: '',
  llmApiKey: '',
  llmModel: '',
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
    if (Object.keys(parsed).length === 0) window.localStorage.removeItem(SETTINGS_KEY);
    else window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(parsed));
  } catch {
    window.localStorage.removeItem(SETTINGS_KEY);
  }
}

async function loadLLMSettingsFromBackend(): Promise<LLMSettings> {
  try {
    const res = await fetch('/api/config');
    const cfg = await res.json();
    return {
      llmEndpoint: cfg.llm_base_url || cfg.claude_base_url || '',
      llmApiKey: '',
      llmModel: cfg.llm_model || cfg.claude_model || '',
    };
  } catch {
    return DEFAULT_LLM;
  }
}

async function saveLLMSettingsToBackend(s: LLMSettings) {
  removeCachedLLMSettings();
  await fetch('/api/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      llm_provider: 'openai-compatible',
      llm_base_url: s.llmEndpoint,
      llm_model: s.llmModel,
      ...(s.llmApiKey ? { llm_api_key: s.llmApiKey, claude_api_key: s.llmApiKey } : {}),
      claude_base_url: s.llmEndpoint,
    }),
  });
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<LLMSettings>(DEFAULT_LLM);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open && !loaded) {
      loadLLMSettingsFromBackend().then((s) => { setForm(s); setLoaded(true); });
    }
  }, [open, loaded]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>{t('设置')}</div>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>{t('API Base URL')}</label>
            <input
              className="input"
              type="text"
              placeholder="https://api.anthropic.com"
              value={form.llmEndpoint}
              onChange={(e) => setForm((p) => ({ ...p, llmEndpoint: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>{t('API Key')}</label>
            <input
              className="input"
              type="password"
              placeholder="Leave blank to keep existing key"
              value={form.llmApiKey}
              onChange={(e) => setForm((p) => ({ ...p, llmApiKey: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>{t('Model')}</label>
            <input
              className="input"
              type="text"
              placeholder="claude-sonnet-4.6"
              value={form.llmModel}
              onChange={(e) => setForm((p) => ({ ...p, llmModel: e.target.value }))}
            />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
            {t('保存后立即生效，AI 对话将使用新配置。')}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => { setLoaded(false); onClose(); }}>{t('取消')}</button>
          <button className="btn" onClick={() => { saveLLMSettingsToBackend(form); onClose(); }}>{t('保存')}</button>
        </div>
      </div>
    </div>
  );
}
