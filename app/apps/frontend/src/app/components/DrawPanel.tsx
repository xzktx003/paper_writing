import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineSkillsSelector } from './SkillsSelector';
import { SkillInfo } from '../api/skillApi';
import { describeFigure, checkVisionCapability } from '../api/paperRagApi';
import { getCollabToken } from '../../api/client';
import { getServerAccessToken } from '../../api/serverAccess';

function authenticatedFetch(url: string, options: RequestInit = {}) {
  const token = getServerAccessToken() || getCollabToken();
  return fetch(url, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
}

function AuthenticatedImage({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const [objectUrl, setObjectUrl] = useState('');

  useEffect(() => {
    let disposed = false;
    let createdUrl = '';
    authenticatedFetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
        return response.blob();
      })
      .then((blob) => {
        if (disposed) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => setObjectUrl(''));
    return () => {
      disposed = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [src]);

  return objectUrl ? <img src={objectUrl} alt={alt} style={style} /> : null;
}

interface DrawServerConfig {
  draw_image_api_key_set: boolean;
  draw_image_api_base?: string;
  draw_image_model?: string;
  draw_image_use_llm_credentials?: boolean;
  llm_api_key_set?: boolean;
  llm_base_url?: string;
  llm_model?: string;
}

interface ImageSettings {
  useLlmCredentials: boolean;
  apiBase: string;
  apiKey: string;
  model: string;
  apiKeyConfigured: boolean;
}

interface SelectedFigureRef {
  id: string;  // unique id for this selection
  docPath: string;
  docName: string;
  figureNum: number;  // user-specified figure number (e.g., 1 for "Figure 1")
  foundPage?: number;  // auto-detected page number in PDF
  description?: string;  // vision model description (if available)
  descriptionLoading?: boolean;  // loading state for description
  descriptionError?: string;  // error if description failed
}

interface DrawState {
  paperContent: string;
  figureDescription: string;
  generatedPrompt: string;
  imageUrl: string | null;
  savedPath: string | null;
  loading: boolean;
  loadingPrompt: boolean;
  error: string | null;
}

interface EditState {
  availableImages: { filename: string; url: string; path: string }[];
  selectedImage: string;  // relative path of image to edit
  editPrompt: string;
  loading: boolean;
  resultImageUrl: string | null;
  error: string | null;
}

interface Props {
  projectPath?: string;
  chapters: { file: string; name?: string }[];
  skills?: SkillInfo[];
  onFigureGenerated?: (imageUrl: string) => void;
}

const STORAGE_KEY = 'draw_panel_state';
export default function DrawPanel({ projectPath, chapters, skills = [], onFigureGenerated }: Props) {
  const { t } = useTranslation();
  const managedProjectId = projectPath?.startsWith('__paper_agent__:')
    ? projectPath.replace('__paper_agent__:', '')
    : undefined;
  
  // Per-panel skills state
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  
  // Edit image state
  const [editState, setEditState] = useState<EditState>({
    availableImages: [],
    selectedImage: '',
    editPrompt: '',
    loading: false,
    resultImageUrl: null,
    error: null,
  });
  
  // Project files (.tex and .pdf)
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  
  // Figure reference state - user selects doc + specifies figure number
  const [selectedDocument, setSelectedDocument] = useState<string>('');  // doc path
  const [figureNumInput, setFigureNumInput] = useState<string>('');       // figure number input
  const [selectedFigureRefs, setSelectedFigureRefs] = useState<SelectedFigureRef[]>([]);  // added refs
  const [visionWarning, setVisionWarning] = useState<string | null>(null);  // vision warning

  // Load saved state from localStorage on mount
  const [state, setState] = useState<DrawState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Reset loading states on reload
        parsed.loading = false;
        parsed.loadingPrompt = false;
        parsed.savedPath = parsed.savedPath || null;
        return parsed;
      }
    } catch (e) {}
    return {
      paperContent: '',
      figureDescription: '',
      generatedPrompt: '',
      imageUrl: null,
      savedPath: null,
      loading: false,
      loadingPrompt: false,
      error: null,
    };
  });

  const [serverConfig, setServerConfig] = useState<DrawServerConfig>({ draw_image_api_key_set: false });
  const [imageSettings, setImageSettings] = useState<ImageSettings>({
    useLlmCredentials: false,
    apiBase: '',
    apiKey: '',
    model: 'gpt-image-2',
    apiKeyConfigured: false,
  });
  const [imageSettingsState, setImageSettingsState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [imageSettingsMessage, setImageSettingsMessage] = useState('');
  const [selectedTexFiles, setSelectedTexFiles] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState<'generate' | 'edit' | 'settings'>('generate');

  const applyServerConfig = (config: any) => {
    const nextConfig: DrawServerConfig = {
      draw_image_api_key_set: Boolean(config.draw_image_api_key_set),
      draw_image_api_base: config.draw_image_api_base,
      draw_image_model: config.draw_image_model,
      draw_image_use_llm_credentials: Boolean(config.draw_image_use_llm_credentials),
      llm_api_key_set: Boolean(config.llm_api_key_set),
      llm_base_url: config.llm_base_url,
      llm_model: config.llm_model,
    };
    setServerConfig(nextConfig);
    setImageSettings({
      useLlmCredentials: Boolean(config.draw_image_use_llm_credentials),
      apiBase: config.draw_image_api_base || '',
      apiKey: '',
      model: config.draw_image_model || 'gpt-image-2',
      apiKeyConfigured: Boolean(config.draw_image_api_key_set),
    });
    return nextConfig;
  };

  const loadServerConfig = async () => {
    const response = await authenticatedFetch('/api/config');
    if (!response.ok) throw new Error('Config unavailable');
    return applyServerConfig(await response.json());
  };

  const imageCredentialsReady = serverConfig.draw_image_use_llm_credentials
    ? Boolean(serverConfig.llm_api_key_set && serverConfig.llm_base_url)
    : Boolean(serverConfig.draw_image_api_key_set && serverConfig.draw_image_api_base);

  // Persist state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    loadServerConfig()
      .catch(() => setServerConfig({ draw_image_api_key_set: false }));
  }, []);

  const saveImageSettings = async () => {
    if (!imageSettings.model.trim()) {
      setImageSettingsState('error');
      setImageSettingsMessage('请输入生图模型名称');
      return;
    }
    if (!imageSettings.useLlmCredentials && !imageSettings.apiBase.trim()) {
      setImageSettingsState('error');
      setImageSettingsMessage('请输入生图 API Base URL');
      return;
    }
    if (!imageSettings.useLlmCredentials && !imageSettings.apiKey.trim() && !imageSettings.apiKeyConfigured) {
      setImageSettingsState('error');
      setImageSettingsMessage('请输入生图 API Key');
      return;
    }

    setImageSettingsState('saving');
    setImageSettingsMessage('');
    try {
      const response = await authenticatedFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draw_image_use_llm_credentials: imageSettings.useLlmCredentials,
          draw_image_api_base: imageSettings.apiBase.trim(),
          draw_image_api_key: imageSettings.apiKey.trim() || undefined,
          draw_image_model: imageSettings.model.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '保存生图设置失败');
      await loadServerConfig();
      setImageSettingsState('success');
      setImageSettingsMessage('生图设置已保存并立即生效');
    } catch (error: any) {
      setImageSettingsState('error');
      setImageSettingsMessage(error.message || '保存生图设置失败');
    }
  };

  // Fetch all .tex and .pdf files from project
  useEffect(() => {
    const fetchProjectFiles = async () => {
      if (!projectPath) return;
      
      const projectId = projectPath.startsWith('__paper_agent__:') 
        ? projectPath.replace('__paper_agent__:', '') 
        : null;
      
      if (!projectId) return;
      
      try {
        // Fetch both .tex and .pdf files
        const [texResp, pdfResp] = await Promise.all([
          authenticatedFetch(`/api/projects/${projectId}/files/list?pattern=*.tex`),
          authenticatedFetch(`/api/projects/${projectId}/files/list?pattern=*.pdf`)
        ]);
        
        let texFiles: string[] = [];
        let pdfFiles: string[] = [];
        
        if (texResp.ok) {
          const texData = await texResp.json();
          texFiles = texData.files || [];
        }
        if (pdfResp.ok) {
          const pdfData = await pdfResp.json();
          pdfFiles = pdfData.files || [];
        }
        
        // Combine: .tex files first, then .pdf files
        setProjectFiles([...texFiles, ...pdfFiles]);
      } catch {
        console.error('Failed to fetch project files');
      }
    };
    
    fetchProjectFiles();
  }, [projectPath]);

  // Fetch available images when Edit tab is active
  useEffect(() => {
    if (activeTab !== 'edit') return;
    
    const fetchImages = async () => {
      if (!managedProjectId) return;
      try {
        const resp = await authenticatedFetch(`/api/draw/list-images?projectId=${encodeURIComponent(managedProjectId)}`);
        if (resp.ok) {
          const data = await resp.json();
          setEditState(prev => ({ ...prev, availableImages: data.images || [] }));
        }
      } catch {
        console.error('Failed to fetch images');
      }
    };
    
    fetchImages();
  }, [activeTab, managedProjectId]);

  // Add a figure reference
  const addFigureRef = () => {
    if (!selectedDocument || !figureNumInput.trim()) return;
    const figureNum = parseInt(figureNumInput, 10);
    if (isNaN(figureNum) || figureNum < 1) return;
    
    const docName = selectedDocument.split('/').pop() || selectedDocument;
    const newRef: SelectedFigureRef = {
      id: `${selectedDocument}#${figureNum}`,
      docPath: selectedDocument,
      docName: docName,
      figureNum: figureNum,
    };
    
    // Avoid duplicates
    if (!selectedFigureRefs.some(r => r.id === newRef.id)) {
      setSelectedFigureRefs(prev => [...prev, newRef]);
    }
    
    setFigureNumInput('');
  };

  // Remove a figure reference
  const removeFigureRef = (id: string) => {
    setSelectedFigureRefs(prev => prev.filter(r => r.id !== id));
  };

  // Get all PDF files for selector
  const pdfFiles = projectFiles.filter(f => f.toLowerCase().endsWith('.pdf'));

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
      const response = await authenticatedFetch(`/api/chapters/content?file=${encodeURIComponent(file)}`);
      const data = await response.json();
      if (data.content) {
        setState(prev => ({ ...prev, paperContent: data.content }));
      }
    } catch {
      console.error('Failed to load chapter');
    }
  };

  // Step 1: Generate image prompt using chat model (from .env config)
  const generatePrompt = async () => {
    if (!state.paperContent.trim() && !state.figureDescription.trim() && selectedFigureRefs.length === 0) {
      setState(prev => ({ ...prev, error: '请输入论文内容、描述，或选择参考图片 (Please input paper content, description, or select reference figures)' }));
      return;
    }

    setState(prev => ({ ...prev, loadingPrompt: true, error: null }));
    setVisionWarning(null);  // Clear previous warning

    const projectId = projectPath?.startsWith('__paper_agent__:') 
      ? projectPath.replace('__paper_agent__:', '') 
      : null;
    
    try {
      // Build figure reference context from selected figures
      let figureContext = '';
      
      if (selectedFigureRefs.length > 0 && projectId) {
        // Check if model supports vision
        const visionCheck = await checkVisionCapability(serverConfig.llm_model || '');
        
        if (visionCheck.supported) {
          // Model supports vision - extract and describe each figure
          const describedFigures: string[] = [];
          
          for (const ref of selectedFigureRefs) {
            // Mark as loading
            setSelectedFigureRefs(prev => 
              prev.map(r => r.id === ref.id ? { ...r, descriptionLoading: true, descriptionError: undefined } : r)
            );
            
            try {
              // Use figureNum to auto-search the page in PDF
              const result = await describeFigure(
                projectId, 
                ref.docPath, 
                ref.figureNum,
                state.paperContent || state.figureDescription
              );
              
              if (result.error) {
                setSelectedFigureRefs(prev => 
                  prev.map(r => r.id === ref.id ? { ...r, descriptionLoading: false, descriptionError: result.error } : r)
                );
                describedFigures.push(`Reference ${ref.docName} Figure ${ref.figureNum} (description unavailable: ${result.error})`);
              } else if (result.foundPage) {
                // Update the figure ref with found page info
                setSelectedFigureRefs(prev => 
                  prev.map(r => r.id === ref.id ? { ...r, descriptionLoading: false, description: result.description, foundPage: result.foundPage } : r)
                );
                describedFigures.push(
                  `Reference: ${ref.docName} Figure ${ref.figureNum} (found on page ${result.foundPage})\n` +
                  `Description: ${result.description}`
                );
              } else {
                setSelectedFigureRefs(prev => 
                  prev.map(r => r.id === ref.id ? { ...r, descriptionLoading: false, description: result.description } : r)
                );
                describedFigures.push(
                  `Reference: ${ref.docName} Figure ${ref.figureNum}\n` +
                  `Description: ${result.description}`
                );
              }
            } catch (err: any) {
              let errorMsg = err.message || 'Failed to extract figure';
              // Make error message more user-friendly
              if (errorMsg.includes('not found')) {
                errorMsg = `Figure ${ref.figureNum} not found in this document`;
              }
              setSelectedFigureRefs(prev => 
                prev.map(r => r.id === ref.id ? { ...r, descriptionLoading: false, descriptionError: errorMsg } : r)
              );
              describedFigures.push(`Reference ${ref.docName} Figure ${ref.figureNum} (${errorMsg})`);
            }
          }
          
          if (describedFigures.length > 0) {
            figureContext = `\n\n=== Reference Figures (Visual Analysis) ===\n${describedFigures.join('\n\n')}\n\nThese figures should serve as visual reference. Incorporate their style, layout, content, and visual characteristics into the generated image.`;
          }
        } else {
          // Model doesn't support vision - show warning and use text-only mode
          setVisionWarning(
            `⚠️ 当前模型 "${serverConfig.llm_model || 'unknown'}" 不支持多模态/视觉功能。\n` +
            `参考图片将仅以文本引用方式传递，无法进行视觉分析。\n` +
            `如需完整的图片参考功能，请使用多模态模型。`
          );
          const figureList = selectedFigureRefs.map(ref => {
            return `Reference: ${ref.docName} Figure ${ref.figureNum}`;
          }).join('\n');
          figureContext = `\n\n=== Reference Figures (Text Mode) ===\n${figureList}\n\nNote: The current model does not support vision, so only figure references are provided. Please generate an image that matches the style and content typically seen in academic papers based on the paper content provided above.`;
        }
      } else if (selectedFigureRefs.length > 0) {
        // No projectId - fall back to text-only
        const figureList = selectedFigureRefs.map(ref => {
          return `Reference ${ref.docName} Figure ${ref.figureNum}`;
        }).join('\n');
        figureContext = `\n\n=== Reference Figures ===\n${figureList}\n\nThese figures should serve as visual reference. Incorporate their style, layout, and content structure into the generated image.`;
      }

      const response = await authenticatedFetch('/api/draw/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paperContent: state.paperContent,
          figureDescription: state.figureDescription,
          ragContext: figureContext,
          selectedSkills,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        const errorMsg = data.error || data.hint || `请求失败 (HTTP ${response.status})`;
        throw new Error(errorMsg);
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
      setState(prev => ({ ...prev, error: t('Please generate prompt first') }));
      return;
    }

    if (!imageCredentialsReady) {
      setState(prev => ({ ...prev, error: '请先在生图设置中配置可用的 Base URL 和 API Key' }));
      setActiveTab('settings');
      return;
    }

    if (!managedProjectId) {
      setState(prev => ({ ...prev, error: t('Draw requires a managed Paper Agent project') }));
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null, savedPath: null }));

    try {
      const response = await authenticatedFetch('/api/draw/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imagePrompt: state.generatedPrompt.trim(),
          projectId: managedProjectId,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || data.hint || 'Failed to generate image');
      }

      setState(prev => ({ 
        ...prev, 
        imageUrl: data.imageUrl,
        savedPath: data.savedPath || null,
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
            🎨 {t('Generate')}
          </button>
          <button style={getTabStyle(activeTab === 'edit')} onClick={() => setActiveTab('edit')}>
            ✏️ {t('Edit')}
          </button>
          <button style={getTabStyle(activeTab === 'settings')} onClick={() => setActiveTab('settings')}>
            ⚙️ {t('Settings')}
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
                <span>{t('Step 1: Generate Image Prompt')}</span>
                <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 400 }}>({t('uses .env model')})</span>
              </div>

              {/* Tex Files selector - multi-select */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('Select .tex Files (Optional)')}</label>
                  <button 
                    style={{ fontSize: '11px', padding: '4px 8px', cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: '4px' }}
                    onClick={async () => {
                      // Load all selected tex files
                      let allContent = '';
                      const texFiles = projectFiles.filter(f => f.toLowerCase().endsWith('.tex'));
                      for (let i = 0; i < texFiles.length; i++) {
                        if (selectedTexFiles.has(i)) {
                          try {
                            const resp = await authenticatedFetch(`/api/chapters/content?file=${encodeURIComponent(texFiles[i])}`);
                            const data = await resp.json();
                            if (data.content) {
                              const fileName = texFiles[i].split('/').pop() || texFiles[i];
                              allContent += `\n\n=== ${fileName} ===\n\n` + data.content;
                            }
                          } catch {
                            console.error('Failed to load selected TeX file');
                          }
                        }
                      }
                      setState(prev => ({ ...prev, paperContent: allContent.trim() }));
                    }}
                  >
                    {t('Load Selected')} ({selectedTexFiles.size})
                  </button>
                </div>
                <div style={{ maxHeight: '100px', overflow: 'auto', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px', background: 'var(--bg-secondary)' }}>
                  {projectFiles.filter(f => f.toLowerCase().endsWith('.tex')).length === 0 ? (
                    <div style={{ fontSize: '11px', color: 'var(--muted)', padding: '4px' }}>
                      {t('No .tex files found in project')}<br/>
                      <span style={{ fontSize: '10px' }}>{t('Total files loaded')}: {projectFiles.length}</span>
                    </div>
                  ) : (
                    projectFiles.filter(f => f.toLowerCase().endsWith('.tex')).map((texFile, idx) => {
                      const actualIdx = projectFiles.indexOf(texFile);
                      return (
                        <label key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', fontSize: '12px', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={selectedTexFiles.has(actualIdx)}
                            onChange={(e) => {
                              setSelectedTexFiles(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(actualIdx);
                                else next.delete(actualIdx);
                                return next;
                              });
                            }}
                          />
                          {texFile.split('/').pop()}
                          <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{texFile}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Skills selector */}
              {skills.length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  🧩 {t('Skills')}
                  </label>
                  <div style={{ position: 'relative', zIndex: 50 }}>
                    <InlineSkillsSelector
                      skills={skills}
                      selectedSkills={selectedSkills}
                      onChange={setSelectedSkills}
                      compact={false}
                      position="below"
                    />
                  </div>
                </div>
              )}

              {/* Paper content */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>{t('Paper Content')}</label>
                <textarea
                  style={{ width: '100%', minHeight: '100px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder={t('Paste paper section content or paragraphs...')}
                  value={state.paperContent}
                  onChange={(e) => setState(prev => ({ ...prev, paperContent: e.target.value }))}
                />
              </div>

              {/* Reference Figures - RAG style: compact layout */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  🖼️ {t('Reference Figures')} ({selectedFigureRefs.length})
                </label>
                
                {/* Compact selector row */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    style={{ flex: '1 1 120px', minWidth: '100px', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '11px' }}
                    value={selectedDocument}
                    onChange={(e) => setSelectedDocument(e.target.value)}
                  >
                    <option value="">PDF...</option>
                    {pdfFiles.map((pdf, idx) => (
                      <option key={idx} value={pdf}>{pdf.split('/').pop()}</option>
                    ))}
                  </select>
                  
                  <span style={{ fontSize: '11px', color: 'var(--muted)', whiteSpace: 'nowrap' }}>Fig</span>
                  <input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={figureNumInput}
                    onChange={(e) => setFigureNumInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addFigureRef()}
                    style={{ width: '40px', padding: '4px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '11px', textAlign: 'center' }}
                  />
                  
                  <button
                    onClick={addFigureRef}
                    disabled={!selectedDocument || !figureNumInput.trim()}
                    style={{ padding: '4px 10px', borderRadius: '4px', border: 'none', background: selectedDocument && figureNumInput.trim() ? 'var(--accent)' : 'var(--border)', color: 'white', fontSize: '11px', cursor: selectedDocument && figureNumInput.trim() ? 'pointer' : 'not-allowed' }}
                  >
                    +{t('Add')}
                  </button>
                </div>
                
                {/* Selected figures list - compact pills */}
                {selectedFigureRefs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                    {selectedFigureRefs.map((ref) => (
                      <div 
                        key={ref.id} 
                        style={{ 
                          display: 'inline-flex', 
                          alignItems: 'center', 
                          gap: '4px', 
                          padding: '2px 6px', 
                          fontSize: '10px', 
                          background: ref.descriptionError ? '#fee2e2' : ref.description ? '#dcfce7' : 'var(--accent-soft)', 
                          borderRadius: '10px', 
                          border: `1px solid ${ref.descriptionError ? '#ef4444' : ref.description ? '#22c55e' : 'var(--accent)'}`,
                          maxWidth: '220px'
                        }}
                      >
                        {ref.descriptionLoading ? (
                          <span style={{ color: 'var(--muted)' }}>⏳</span>
                        ) : ref.descriptionError ? (
                          <span style={{ color: '#ef4444' }}>⚠️</span>
                        ) : ref.description ? (
                          <span style={{ color: '#22c55e' }}>✓</span>
                        ) : null}
                        <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.docName}</span>
                        <span style={{ color: 'var(--muted)' }}>Fig{ref.figureNum}</span>
                        {ref.foundPage && (
                          <span style={{ color: 'var(--muted)', fontSize: '9px' }}>p{ref.foundPage}</span>
                        )}
                        <button
                          onClick={() => removeFigureRef(ref.id)}
                          style={{ padding: '0', marginLeft: '2px', borderRadius: '50%', width: '14px', height: '14px', border: 'none', background: 'var(--accent)', color: 'white', fontSize: '9px', cursor: 'pointer', lineHeight: '1' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {selectedFigureRefs.some(r => r.description) && (
                  <div style={{ marginTop: '4px', fontSize: '9px', color: 'var(--muted)' }}>
                    {t('Image analyzed legend')}
                  </div>
                )}
                
                {/* Vision warning */}
                {visionWarning && (
                  <div style={{ 
                    marginTop: '8px', 
                    padding: '8px 10px', 
                    background: 'rgba(251, 191, 36, 0.1)', 
                    border: '1px solid #fbbf24', 
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: '#92400e',
                    whiteSpace: 'pre-line'
                  }}>
                    {visionWarning}
                  </div>
                )}
              </div>

              <button
                style={getButtonStyle(true)}
                onClick={generatePrompt}
                disabled={state.loadingPrompt || (!state.paperContent.trim() && !state.figureDescription.trim() && selectedFigureRefs.length === 0)}
              >
                {state.loadingPrompt ? `✨ ${t('Generating...')}` : `✨ ${t('Generate Image Prompt')}`}
              </button>
            </div>

            {/* Final prompt: users may write it directly or edit the AI-generated draft. */}
            <div style={{ background: 'rgba(59, 130, 246, 0.05)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <label htmlFor="draw-final-image-prompt" style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📝</span>
                <span>{t('Generated Prompt')}（可直接填写或修改）</span>
              </label>
              <textarea
                id="draw-final-image-prompt"
                value={state.generatedPrompt}
                placeholder="直接写入希望执行的生图 Prompt，或先让 AI 生成草稿后再修改。"
                onChange={(event) => setState(previous => ({
                  ...previous,
                  generatedPrompt: event.target.value,
                }))}
                style={{ width: '100%', minHeight: '150px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '13px', lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }}
              />
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--muted)' }}>
                生成图片时会严格使用这里的最终内容，不会自动追加论文正文。
              </div>
            </div>

            {/* Step 2: Generate image */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🎨</span>
                  <span>{t('Step 2: Generate Image')}</span>
                  {!imageCredentialsReady && (
                    <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 400 }}>{t('API Key required')}</span>
                  )}
                </div>

                <button
                  style={getButtonStyle(true)}
                  onClick={generateImage}
                  disabled={state.loading || !state.generatedPrompt.trim() || !imageCredentialsReady || !managedProjectId}
                >
                  {state.loading ? `🎨 ${t('Generating...')}` : `🎨 ${t('Generate Image')}`}
                </button>

                {!imageCredentialsReady && (
                  <div style={{ padding: '10px 12px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', color: '#3b82f6', fontSize: '13px', marginTop: '12px' }}>
                    请在“设置”页配置独立的生图 Base URL/API Key，或启用“复用语言模型凭证”。
                  </div>
                )}
              </div>

            {/* Image preview */}
            {state.imageUrl && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>✅</span>
                  <span>{t('Generated Image')}</span>
                  <button
                    onClick={() => {
                      // Extract filename/path from imageUrl and switch to edit tab
                      // The backend returns a managed project URL containing projectId.
                      if (!state.imageUrl) return;
                      const urlParts = state.imageUrl.split('/');
                      const filename = decodeURIComponent(urlParts.pop()?.split('?')[0] || '');
                      if (filename) {
                        setActiveTab('edit');
                        // Refresh the images list first, then select this one
                        setEditState(prev => ({ ...prev, selectedImage: filename, error: '' }));
                      }
                    }}
                    style={{
                      marginLeft: 'auto',
                      padding: '6px 12px',
                      background: 'var(--accent)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    ✏️ {t('Edit this image')} →
                  </button>
                </div>
                {state.savedPath && (
                  <div style={{ marginBottom: 12, padding: '9px 11px', borderRadius: 7, background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.35)', color: 'var(--text)', fontSize: 12 }}>
                     <span style={{ color: '#16a34a', fontWeight: 700 }}>{t('Image saved to')}: </span>
                    <code style={{ wordBreak: 'break-all' }}>{state.savedPath}</code>
                     <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 10 }}>{t('Project folder')}: draw/</div>
                  </div>
                )}
                <AuthenticatedImage
                  src={state.imageUrl}
                  alt="Generated figure" 
                  style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }} 
                />
              </div>
            )}
          </>
        ) : activeTab === 'edit' ? (
          /* Edit Image Tab */
          <>
            {/* Select image from project or upload new */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>📁</span>
                 <span>{t('Select Image to Edit')}</span>
                <button
                  onClick={async () => {
                    // Refresh images list
                    try {
                      if (!managedProjectId) return;
                      const resp = await authenticatedFetch(`/api/draw/list-images?projectId=${encodeURIComponent(managedProjectId)}`);
                      if (resp.ok) {
                        const data = await resp.json();
                        setEditState(prev => ({ ...prev, availableImages: data.images || [] }));
                      }
                    } catch {
                      console.error('Failed to refresh images');
                    }
                  }}
                  style={{
                    marginLeft: 'auto',
                    padding: '4px 8px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    color: 'var(--muted)',
                  }}
                >
                   🔄 {t('Refresh')}
                </button>
              </div>
              
              {/* Image grid */}
              {editState.availableImages.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                  {editState.availableImages.map((img) => (
                    <div
                      key={img.path || img.filename}
                      onClick={() => {
                        // Toggle selection: click to select, click again to deselect
                        if (editState.selectedImage === (img.path || img.filename)) {
                          setEditState(prev => ({ ...prev, selectedImage: '', error: '' }));
                        } else {
                          setEditState(prev => ({ ...prev, selectedImage: img.path || img.filename, error: '' }));
                        }
                      }}
                      style={{
                        position: 'relative',
                        aspectRatio: '1',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        border: editState.selectedImage === (img.path || img.filename) ? '3px solid var(--accent)' : '2px solid var(--border)',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      title={img.path || img.filename}
                    >
                      <AuthenticatedImage
                        src={img.url}
                        alt={img.filename}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {editState.selectedImage === (img.path || img.filename) && (
                        <div style={{
                          position: 'absolute',
                          top: '4px',
                          right: '4px',
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                        }}>
                          ✓
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {editState.availableImages.length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--muted)', fontSize: '13px', marginBottom: '12px' }}>
                   {t('No images found in project. Upload one to get started.')}
                </div>
              )}
              
              {/* + Upload button */}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  border: '2px dashed var(--border)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--muted)',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
              >
                <span style={{ fontSize: '16px' }}>+</span>
                 <span>{t('Upload New Image')}</span>
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    
                    const formData = new FormData();
                    formData.append('file', file);
                    
                    try {
                      if (!managedProjectId) return;
                      const resp = await authenticatedFetch(`/api/draw/upload-image?projectId=${encodeURIComponent(managedProjectId)}`, {
                        method: 'POST',
                        body: formData,
                      });
                      const data = await resp.json();
                      if (data.success && data.filename) {
                        // Refresh the image list
                        const listResp = await authenticatedFetch(`/api/draw/list-images?projectId=${encodeURIComponent(managedProjectId)}`);
                        if (listResp.ok) {
                          const listData = await listResp.json();
                          setEditState(prev => ({ ...prev, availableImages: listData.images || [], selectedImage: data.filename }));
                        } else {
                          setEditState(prev => ({ ...prev, selectedImage: data.filename }));
                        }
                      } else {
                        setEditState(prev => ({ ...prev, error: data.error || t('Upload failed') }));
                      }
                    } catch (err) {
                      setEditState(prev => ({ ...prev, error: t('Upload failed') }));
                    }
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
            
            {/* Selected image preview */}
            {editState.selectedImage && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>✏️</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('Editing')}: {editState.selectedImage}</span>
                  <button
                    onClick={() => setEditState(prev => ({ ...prev, selectedImage: '' }))}
                    style={{
                      padding: '4px 10px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      color: '#ef4444',
                    }}
                    title={t('Remove selection')}
                  >
                    ✕ {t('Clear')}
                  </button>
                </div>
                <AuthenticatedImage
                  src={`/api/draw/images/${encodeURIComponent(editState.selectedImage)}?projectId=${encodeURIComponent(managedProjectId || '')}`}
                  alt="Selected for editing"
                  style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
            )}
            
            {/* Edit prompt */}
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>💬</span>
                   <span>{t('Edit Instruction')}</span>
              </div>
              <textarea
                style={{ width: '100%', minHeight: '80px', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }}
                 placeholder={t('e.g., Change the background color to light blue, make the arrows thicker, add a title at the top...')}
                value={editState.editPrompt}
                onChange={(e) => setEditState(prev => ({ ...prev, editPrompt: e.target.value }))}
              />
              
              <button
                style={getButtonStyle(true)}
                onClick={async () => {
                  if (!editState.selectedImage || !editState.editPrompt.trim()) {
                    setEditState(prev => ({ ...prev, error: t('Please select an image and enter edit instructions') }));
                    return;
                  }
                  if (!imageCredentialsReady) {
                    setEditState(prev => ({ ...prev, error: '请先在生图设置中配置可用的 Base URL 和 API Key' }));
                    return;
                  }
                  if (!managedProjectId) {
                    setEditState(prev => ({ ...prev, error: t('Draw requires a managed Paper Agent project') }));
                    return;
                  }
                  
                  setEditState(prev => ({ ...prev, loading: true, error: null }));
                  
                  try {
                    const response = await authenticatedFetch('/api/draw/edit-image', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        imagePath: editState.selectedImage,
                        editPrompt: editState.editPrompt,
                        paperContent: state.paperContent,
                        projectId: managedProjectId,
                      }),
                    });
                    
                    const data = await response.json();
                    
                    if (!response.ok) {
                      throw new Error(data.error || data.hint || 'Failed to edit image');
                    }
                    
                    setEditState(prev => ({ 
                      ...prev, 
                      resultImageUrl: data.imageUrl,
                      loading: false,
                    }));
                    
                    // Update available images list
                    const refreshResp = await authenticatedFetch(`/api/draw/list-images?projectId=${encodeURIComponent(managedProjectId)}`);
                    const refreshData = await refreshResp.json();
                    if (refreshData.images) {
                      setEditState(prev => ({ ...prev, availableImages: refreshData.images }));
                    }
                  } catch (err: any) {
                    setEditState(prev => ({ 
                      ...prev, 
                      error: err.message,
                      loading: false,
                    }));
                  }
                }}
                disabled={editState.loading || !editState.selectedImage || !editState.editPrompt.trim() || !imageCredentialsReady || !managedProjectId}
              >
                 {editState.loading ? `✏️ ${t('Editing...')}` : `✏️ ${t('Edit Image')}`}
              </button>
              
              {editState.error && (
                <div style={{ padding: '10px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '13px', marginTop: '12px' }}>
                  {editState.error}
                </div>
              )}
            </div>
            
            {/* Edit result */}
            {editState.resultImageUrl && (
              <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>✅</span>
                  <span>{t('Edited Image')}</span>
                </div>
                <AuthenticatedImage
                  src={editState.resultImageUrl}
                  alt="Edited result"
                  style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border)' }}
                />
              </div>
            )}
          </>
        ) : (
          /* Server-managed Draw Settings */
          <>
            <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>⚙️</span>
                <span>{t('Server-managed image API')}</span>
              </div>
              <div style={{ display: 'grid', gap: '12px', fontSize: '13px' }}>
                <label htmlFor="draw-image-use-llm-credentials" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                  <input
                    id="draw-image-use-llm-credentials"
                    type="checkbox"
                    checked={imageSettings.useLlmCredentials}
                    onChange={(event) => setImageSettings(previous => ({
                      ...previous,
                      useLlmCredentials: event.target.checked,
                    }))}
                  />
                  <span>
                    <strong>复用语言模型的 Base URL 和 API Key</strong>
                    <span style={{ display: 'block', marginTop: '3px', color: 'var(--muted)', fontSize: '11px' }}>
                      当前语言模型地址：{serverConfig.llm_base_url || '未配置'}；API Key：{serverConfig.llm_api_key_set ? '已配置' : '未配置'}。
                    </span>
                  </span>
                </label>

                {!imageSettings.useLlmCredentials && (
                  <>
                    <div>
                      <label htmlFor="draw-image-api-base" style={{ display: 'block', fontWeight: 600, marginBottom: '5px' }}>生图 API Base URL</label>
                      <input
                        id="draw-image-api-base"
                        type="url"
                        value={imageSettings.apiBase}
                        placeholder="https://api.example.com/v1"
                        onChange={(event) => setImageSettings(previous => ({ ...previous, apiBase: event.target.value }))}
                        style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      />
                    </div>
                    <div>
                      <label htmlFor="draw-image-api-key" style={{ display: 'block', fontWeight: 600, marginBottom: '5px' }}>生图 API Key</label>
                      <input
                        id="draw-image-api-key"
                        type="password"
                        value={imageSettings.apiKey}
                        placeholder={imageSettings.apiKeyConfigured ? '已配置；留空可保留原 Key' : '请输入 API Key'}
                        autoComplete="new-password"
                        onChange={(event) => setImageSettings(previous => ({ ...previous, apiKey: event.target.value }))}
                        style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="draw-image-model" style={{ display: 'block', fontWeight: 600, marginBottom: '5px' }}>生图模型</label>
                  <input
                    id="draw-image-model"
                    type="text"
                    value={imageSettings.model}
                    placeholder="gpt-image-2"
                    onChange={(event) => setImageSettings(previous => ({ ...previous, model: event.target.value }))}
                    style={{ width: '100%', padding: '9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>

                <button
                  type="button"
                  onClick={saveImageSettings}
                  disabled={imageSettingsState === 'saving'}
                  style={getButtonStyle(true)}
                >
                  {imageSettingsState === 'saving' ? '保存中…' : '保存生图设置'}
                </button>

                {imageSettingsMessage && (
                  <div style={{ padding: '9px 10px', borderRadius: '6px', background: imageSettingsState === 'error' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', color: imageSettingsState === 'error' ? '#dc2626' : '#16a34a' }}>
                    {imageSettingsMessage}
                  </div>
                )}

                <div style={{ fontSize: '11px', color: 'var(--muted)', lineHeight: 1.6 }}>
                  API Key 只提交到受认证保护的后端配置接口，不会写入浏览器 localStorage。保存后立即用于下一次生图请求，无需重启服务。
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
