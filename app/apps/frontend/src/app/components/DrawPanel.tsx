import React, { useState, useEffect } from 'react';

// Types
interface ApiSettings {
  provider: 'openai' | 'azure' | 'custom';
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface SavedSetting {
  id: string;
  name: string;
  settings: ApiSettings;
}

interface DrawState {
  paperContent: string;
  figureDescription: string;
  generatedPrompt: string;
  imageUrl: string | null;
  loading: boolean;
  loadingPrompt: boolean;
  error: string | null;
}

interface Props {
  projectPath?: string;
  chapters: { file: string; name?: string }[];
  onFigureGenerated?: (imageUrl: string) => void;
}

const STORAGE_KEY = 'draw_panel_state';
const SETTINGS_KEY = 'draw_saved_settings';

export default function DrawPanel({ projectPath, chapters, onFigureGenerated }: Props) {
  // Derive papers project path: __paper_agent__:projectName -> /papers/projectName
  const papersProjectPath = projectPath?.startsWith('__paper_agent__:') 
    ? `/data01/home/zhaozx/paper_wrighting/papers/${projectPath.replace('__paper_agent__:', '')}`
    : undefined;

  // Load saved state from localStorage on mount
  const [state, setState] = useState<DrawState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Reset loading states on reload
        parsed.loading = false;
        parsed.loadingPrompt = false;
        return parsed;
      }
    } catch (e) {}
    return {
      paperContent: '',
      figureDescription: '',
      generatedPrompt: '',
      imageUrl: null,
      loading: false,
      loadingPrompt: false,
      error: null,
    };
  });

  const [apiSettings, setApiSettings] = useState<ApiSettings>(() => {
    try {
      const saved = localStorage.getItem('draw_api_settings');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      provider: 'openai',
      baseUrl: '',
      apiKey: '',
      model: '',
    };
  });

  const [savedSettings, setSavedSettings] = useState<SavedSetting[]>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {}
    return [];
  });

  const [editingSetting, setEditingSetting] = useState<SavedSetting | null>(null);
  const [selectedChapterIdx, setSelectedChapterIdx] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'generate' | 'settings'>('generate');

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('draw_api_settings', JSON.stringify(apiSettings));
  }, [apiSettings]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(savedSettings));
  }, [savedSettings]);

  // Save current settings
  const saveCurrentSettings = () => {
    if (!apiSettings.model.trim()) {
      setState(prev => ({ ...prev, error: '请输入设置名称和模型名' }));
      return;
    }
    const name = apiSettings.model.trim();
    const existing = savedSettings.find(s => s.name === name);
    
    if (existing) {
      // Update existing
      setSavedSettings(prev => prev.map(s => 
        s.name === name ? { ...s, settings: apiSettings } : s
      ));
    } else {
      // Add new
      const newSetting: SavedSetting = {
        id: Date.now().toString(),
        name,
        settings: { ...apiSettings },
      };
      setSavedSettings(prev => [...prev, newSetting]);
    }
    setState(prev => ({ ...prev, error: null }));
  };

  // Load saved setting
  const loadSavedSetting = (setting: SavedSetting) => {
    setApiSettings(setting.settings);
    setEditingSetting(setting);
  };

  // Delete saved setting
  const deleteSavedSetting = (id: string) => {
    setSavedSettings(prev => prev.filter(s => s.id !== id));
  };

  // Helper for button styles
  const getButtonStyle = (primary?: boolean): React.CSSProperties => ({
    width: '100%', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
    cursor: 'pointer', border: 'none', background: primary ? 'var(--accent)' : 'var(--bg-secondary)',
    color: primary ? '#fff' : 'var(--text-primary)', marginTop: '12px', transition: 'all 0.2s',
  });

  const getTabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--text-secondary)', border: 'none', transition: 'all 0.2s',
  });

  // Load chapter content
  const loadChapterContent = async (file: string) => {
    try {
      const response = await fetch(`/api/chapters/content?file=${encodeURIComponent(file)}`);
      const data = await response.json();
      if (data.content) {
        setState(prev => ({ ...prev, paperContent: data.content }));
      }
    } catch (err) {
      console.error('Failed to load chapter:', err);
    }
  };

  // Step 1: Generate image prompt using chat model (from .env config)
  const generatePrompt = async () => {
    if (!state.paperContent.trim() && !state.figureDescription.trim()) {
      setState(prev => ({ ...prev, error: '请输入论文内容或描述' }));
      return;
    }

    setState(prev => ({ ...prev, loadingPrompt: true, error: null }));

    try {
      const response = await fetch('/api/draw/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperContent: state.paperContent,
          figureDescription: state.figureDescription,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.hint || '生成描述失败');
      }

      setState(prev => ({ 
        ...prev, 
        generatedPrompt: data.imagePrompt || data.raw,
        loadingPrompt: false 
      }));
    } catch (err: any) {
      setState(prev => ({ 
        ...prev, 
        error: err.message,
        loadingPrompt: false 
      }));
    }
  };

  // Step 2: Generate final image using image API
  const generateImage = async () => {
    if (!state.generatedPrompt.trim()) {
      setState(prev => ({ ...prev, error: '请先生成图片描述' }));
      return;
    }

    if (!apiSettings.apiKey) {
      setState(prev => ({ ...prev, error: '请配置图片API Key' }));
      setActiveTab('settings');
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch('/api/draw/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt: state.generatedPrompt,
          paperContent: state.paperContent,
          apiSettings: apiSettings,
          projectPath: papersProjectPath,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.hint || '生成图片失败');
      }

      setState(prev => ({ 
        ...prev, 
        imageUrl: data.imageUrl,
        loading: false 
      }));

      if (onFigureGenerated && data.imageUrl) {
        onFigureGenerated(data.imageUrl);
      }
    } catch (err: any) {
      setState(prev => ({ 
        ...prev, 
        error: err.message,
        loading: false 
      }));
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Header with tabs */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={getTabStyle(activeTab === 'generate')} onClick={() => setActiveTab('generate')}>
            🎨 生成图片
          </button>
          <button style={getTabStyle(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
            ⚙️ API设置
          </button>
        </div>
      </div>

      <div style={{ flex: 1, padding: '16px', overflow: 'auto' }}>
        {activeTab === 'generate' ? (
          <>
            {/* Error display */}
            {state.error && (
              <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>
                {state.error}
                <button 
                  onClick={() => setState(prev => ({ ...prev, error: null }))}
                  style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            )}

            {/* Step 1: Generate image prompt */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>✨</span>
                <span>Step 1: 生成AI图片描述</span>
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 400 }}>(使用.env中的模型)</span>
              </div>

              {/* Chapter selector - multi-select */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>选择章节 (可选)</label>
                  <button 
                    style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px' }}
                    onClick={async () => {
                      // Load all selected chapters
                      const selectedChapters = chapters.filter((_, idx) => selectedChapterIdx.has(idx));
                      let allContent = '';
                      for (const ch of selectedChapters) {
                        const resp = await fetch(`/api/chapters/content?file=${encodeURIComponent(ch.file)}`);
                        const data = await resp.json();
                        if (data.content) {
                          allContent += `\n\n=== ${ch.name || ch.file} ===\n\n` + data.content;
                        }
                      }
                      setState(prev => ({ ...prev, paperContent: allContent.trim() }));
                    }}
                  >
                    加载选中章节
                  </button>
                </div>
                <div style={{ maxHeight: '100px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px', background: 'var(--bg-secondary)' }}>
                  {chapters.map((ch, idx) => (
                    <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12px', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={selectedChapterIdx.has(idx)}
                        onChange={(e) => {
                          setSelectedChapterIdx(prev => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(idx);
                            else next.delete(idx);
                            return next;
                          });
                        }}
                      />
                      {ch.name || ch.file}
                    </label>
                  ))}
                </div>
              </div>

              {/* Paper content */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>论文内容</label>
                <textarea
                  style={{ width: '100%', minHeight: '120px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder="粘贴论文的章节内容或段落..."
                  value={state.paperContent}
                  onChange={(e) => setState(prev => ({ ...prev, paperContent: e.target.value }))}
                />
              </div>

              {/* Figure description */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>图片描述 (可选)</label>
                <textarea
                  style={{ width: '100%', minHeight: '60px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder="例如: 生成一个框架图，展示模型的整体架构..."
                  value={state.figureDescription}
                  onChange={(e) => setState(prev => ({ ...prev, figureDescription: e.target.value }))}
                />
              </div>

              <button
                style={getButtonStyle(true)}
                onClick={generatePrompt}
                disabled={state.loadingPrompt || (!state.paperContent.trim() && !state.figureDescription.trim())}
              >
                {state.loadingPrompt ? '✨ 生成描述中...' : '✨ 生成图片描述'}
              </button>
            </div>

            {/* Generated prompt display */}
            {state.generatedPrompt && (
              <div style={{ background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>📝</span>
                  <span>生成的图片描述</span>
                </div>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {state.generatedPrompt}
                </div>
              </div>
            )}

            {/* Step 2: Generate image */}
            {state.generatedPrompt && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🎨</span>
                  <span>Step 2: 生成图片</span>
                  {!apiSettings.apiKey && (
                    <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 400 }}>需配置API Key</span>
                  )}
                </div>

                <button
                  style={getButtonStyle(true)}
                  onClick={generateImage}
                  disabled={state.loading || !apiSettings.apiKey}
                >
                  {state.loading ? '🎨 生成图片中...' : '🎨 生成图片'}
                </button>

                {!apiSettings.apiKey && (
                  <div style={{ padding: '10px 12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', color: '#3b82f6', fontSize: '13px', marginTop: '12px' }}>
                    请先点击右上角「API设置」配置图片API Key
                  </div>
                )}
              </div>
            )}

            {/* Image preview */}
            {state.imageUrl && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>✅</span>
                  <span>生成结果</span>
                </div>
                <img 
                  src={state.imageUrl + (papersProjectPath ? `?projectPath=${encodeURIComponent(papersProjectPath)}` : '')} 
                  alt="Generated figure" 
                  style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }} 
                />
              </div>
            )}
          </>
        ) : (
          /* API Settings Tab */
          <>
            {/* Saved Settings List */}
            {savedSettings.length > 0 && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>📁</span>
                  <span>已保存的设置</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {savedSettings.map(setting => (
                    <div 
                      key={setting.id}
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 12px', borderRadius: '6px',
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                        fontSize: '12px'
                      }}
                    >
                      <span 
                        style={{ cursor: 'pointer', color: 'var(--accent)', fontWeight: 500 }}
                        onClick={() => loadSavedSetting(setting)}
                      >
                        {setting.name}
                      </span>
                      <button
                        style={{ 
                          padding: '2px 6px', fontSize: '10px', cursor: 'pointer',
                          background: 'transparent', border: '1px solid var(--border)',
                          borderRadius: '4px', color: 'var(--text-secondary)'
                        }}
                        onClick={() => deleteSavedSetting(setting.id)}
                        title="删除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Current Settings */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>⚙️</span>
                <span>当前API设置</span>
                {editingSetting && (
                  <span style={{ fontSize: '11px', color: 'var(--accent)' }}>已加载: {editingSetting.name}</span>
                )}
              </div>
              
              <div style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Provider</label>
                  <select
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}
                    value={apiSettings.provider}
                    onChange={(e) => setApiSettings(prev => ({ ...prev, provider: e.target.value as any }))}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="azure">Azure</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Base URL</label>
                  <input
                    type="text"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}
                    placeholder={apiSettings.provider === 'azure' ? '' : 'https://api.openai.com/v1'}
                    value={apiSettings.baseUrl}
                    onChange={(e) => setApiSettings(prev => ({ ...prev, baseUrl: e.target.value }))}
                  />
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '4px' }}>
                    {apiSettings.provider === 'azure' ? '留空使用默认配置' : '例如: https://api.openai.com/v1'}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>API Key *</label>
                  <input
                    type="password"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}
                    placeholder="sk-... 或 Azure key"
                    value={apiSettings.apiKey}
                    onChange={(e) => setApiSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>Model (也是保存的名称)</label>
                  <input
                    type="text"
                    style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px' }}
                    placeholder="gpt-image-2-vip"
                    value={apiSettings.model}
                    onChange={(e) => setApiSettings(prev => ({ ...prev, model: e.target.value }))}
                  />
                </div>

                <button
                  style={{ ...getButtonStyle(true), marginTop: '8px' }}
                  onClick={saveCurrentSettings}
                >
                  💾 保存当前设置 (以Model名称)
                </button>

                <div style={{ fontSize: '12px', color: 'var(--muted)', padding: '8px 0' }}>
                  <strong>注意:</strong> Step 1 (生成描述) 使用 .env 中的 OPENPRISM_LLM_* 配置，
                  <br />Step 2 (生成图片) 使用上方配置的API
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
