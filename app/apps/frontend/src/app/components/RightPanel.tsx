import React, { useState, useCallback, useRef } from 'react';
import { ConversationTabs } from './ConversationTabs';
import { ChatView } from './ChatView';
import { NewConversationDialog } from './NewConversationDialog';
import { SkillPanel } from './SkillPanel';
import { ReviewReportPanel } from './ReviewReportPanel';
import { AntiAiPanel } from './AntiAiPanel';
import { PipelinePanelV2 } from './PipelinePanelV2';
import { CitationVerificationPanel } from './CitationVerificationPanel';
import { PaperRagPanel } from './PaperRagPanel';
import DrawPanel from './DrawPanel';
import { ConversationSummary, Conversation, structuredReview, detectAntiAi, detectAntiAiDeep, detectAntiAiGPTZero, verifyTexCitations, crossCheckCitations } from '../api/conversationApi';
import { PendingEdit } from '../hooks/useConversations';

type TabType = 'chat' | 'skills' | 'rag' | 'draw' | 'review' | 'anti-ai' | 'pipeline' | 'citations';

interface AttachedFile {
  id: string;
  dataUrl: string;
  name: string;
  type: string;
  isImage: boolean;
  size: number;
}

interface Props {
  conversations: ConversationSummary[];
  activeConv: Conversation | null;
  loading: boolean;
  chapters: { file: string }[];
  skills: { name: string; display_name: string }[];
  projectFiles?: { path: string; type: 'file' | 'dir' }[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: (data: any) => void;
  onSend: (message: string, files?: AttachedFile[]) => void;
  onRename?: (id: string, newName: string) => void;
  globalSkills?: string[];
  chapterSkills?: string[];
  onActivateSkill?: (skillName: string) => void;
  projectPath?: string;
  activeFile?: string;
  pendingEdits?: PendingEdit[];
  onAcceptEdit?: (editId: string) => void;
  onRejectEdit?: (editId: string) => void;
}

export function RightPanel({ conversations, activeConv, loading, chapters, skills, projectFiles, onSelect, onClose, onCreate, onSend, onRename, globalSkills = [], chapterSkills = [], onActivateSkill = () => {}, projectPath, activeFile, pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [reviewReport, setReviewReport] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [antiAiReport, setAntiAiReport] = useState<any>(null);
  const [antiAiLoading, setAntiAiLoading] = useState(false);
  const [deepReport, setDeepReport] = useState<any>(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [gptzeroReport, setGptzeroReport] = useState<any>(null);
  const [gptzeroLoading, setGptzeroLoading] = useState(false);
  const [citationReport, setCitationReport] = useState<any>(null);
  const [citationLoading, setCitationLoading] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRunReview = useCallback(async () => {
    if (!projectPath) return;
    setReviewLoading(true);
    try { const r = await structuredReview(projectPath); setReviewReport(r); } catch {}
    setReviewLoading(false);
  }, [projectPath]);

  const handleRunAntiAi = useCallback(async () => {
    if (!projectPath) return;
    setAntiAiLoading(true);
    try { const r = await detectAntiAi(projectPath); setAntiAiReport(r); } catch {}
    setAntiAiLoading(false);
  }, [projectPath]);

  const handleRunDeepDetection = useCallback(async () => {
    if (!projectPath) return;
    setDeepLoading(true);
    try { const r = await detectAntiAiDeep(projectPath); setDeepReport(r); } catch {}
    setDeepLoading(false);
  }, [projectPath]);

  const handleRunGPTZero = useCallback(async () => {
    if (!projectPath) return;
    setGptzeroLoading(true);
    try { const r = await detectAntiAiGPTZero(projectPath); setGptzeroReport(r); } catch {}
    setGptzeroLoading(false);
  }, [projectPath]);

  const handleRunCitationVerification = useCallback(async () => {
    if (!projectPath) return;
    setCitationLoading(true);
    try { const r = await verifyTexCitations(projectPath, activeFile); setCitationReport(r); } catch {}
    setCitationLoading(false);
  }, [projectPath, activeFile]);

  const handleRunCrossCheck = useCallback(async () => {
    if (!projectPath) return;
    setCitationLoading(true);
    try { const r = await crossCheckCitations(projectPath, activeFile); setCitationReport((prev: any) => ({ ...prev, ...r })); } catch {}
    setCitationLoading(false);
  }, [projectPath, activeFile]);

  const handleSend = () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    onSend(inputValue.trim(), attachedFiles.length > 0 ? attachedFiles : undefined);
    setInputValue('');
    setAttachedFiles([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /** Handle Ctrl+V paste for images from clipboard */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          setAttachedFiles(prev => [...prev, {
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            dataUrl: reader.result as string,
            name: file.name || `paste-${Date.now()}.png`,
            type: file.type || 'image/png',
            isImage: true,
            size: file.size,
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    addFilesToList(Array.from(files));
    // Reset input so same file can be re-selected
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    addFilesToList(Array.from(files));
    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /** Add files to the attached files list */
  const addFilesToList = (files: File[]) => {
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedFiles(prev => [...prev, {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: reader.result as string,
          name: file.name,
          type: file.type,
          isImage,
          size: file.size,
        }]);
      };
      // For non-image files, we still read as data URL for transmission
      // The backend will handle them differently based on type
      reader.readAsDataURL(file);
    }
  };

  const removeFile = (id: string) => {
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  /** Format file size for display */
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /** Handle drag and drop */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addFilesToList(Array.from(files));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)' }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, overflow: 'auto' }}>
        {([
          { key: 'chat', label: '💬 Chat' },
          { key: 'skills', label: '🧩 Skills' },
          { key: 'rag', label: '🔎 RAG' },
          { key: 'draw', label: '🖼️ Draw' },
          { key: 'review', label: '📋 Review' },
          { key: 'citations', label: '📚 Citations' },
          { key: 'anti-ai', label: '🔍 Anti-AI' },
          { key: 'pipeline', label: '⚡ Pipeline' },
        ] as const).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '8px 2px', minWidth: 0,
              border: 'none',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none',
              color: activeTab === tab.key ? 'var(--accent-strong)' : 'var(--muted)',
              fontSize: '10px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'chat' ? (
        <>
          <div style={{ height: '38px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', background: 'var(--panel-muted)' }}>
            <ConversationTabs
              conversations={conversations}
              activeId={activeConv?.id || null}
              onSelect={onSelect}
              onClose={onClose}
              onNew={() => setShowNewDialog(true)}
              onRename={onRename}
            />
          </div>

          {activeConv ? (
            <>
              <ChatView messages={activeConv.history} loading={loading} pendingEdits={pendingEdits} onAcceptEdit={onAcceptEdit} onRejectEdit={onRejectEdit} />
              <div 
                style={{ 
                  borderTop: '1px solid var(--border)', 
                  padding: '10px 12px', 
                  background: 'var(--panel-muted)',
                  transition: 'background-color 0.2s',
                  ...(isDragOver ? { backgroundColor: 'var(--accent-soft)' } : {}),
                }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontSize: '10px', fontWeight: 600 }}>
                    {activeConv.context_scope.type === 'chapter' ? `Ch: ${activeConv.context_scope.file}` :
                     activeConv.context_scope.type === 'global' ? 'Global' : 'Free'}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-secondary)', fontSize: '10px', fontWeight: 500 }}>
                    {activeConv.mode}
                  </span>
                  {isDragOver && (
                    <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'var(--accent)', color: '#fff', fontSize: '10px', fontWeight: 600 }}>
                      拖放文件到此处
                    </span>
                  )}
                </div>
                {/* File previews */}
                {attachedFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {attachedFiles.map(file => (
                      <div 
                        key={file.id} 
                        style={{ 
                          position: 'relative', 
                          width: file.isImage ? 64 : 80, 
                          height: file.isImage ? 64 : 64, 
                          borderRadius: 8, 
                          overflow: 'hidden', 
                          border: '1px solid var(--border)', 
                          flexShrink: 0,
                          background: file.isImage ? undefined : 'var(--bg-secondary)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '4px',
                        }}
                      >
                        {file.isImage ? (
                          <img src={file.dataUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ fontSize: '20px', marginBottom: '2px' }}>
                            {file.type.includes('pdf') ? '📄' : 
                             file.type.includes('word') || file.type.includes('document') ? '📝' :
                             file.type.includes('text') ? '📃' :
                             file.type.includes('spreadsheet') || file.type.includes('excel') ? '📊' :
                             file.type.includes('presentation') || file.type.includes('powerpoint') ? '📽️' :
                             '📎'}
                          </div>
                        )}
                        {!file.isImage && (
                          <div style={{ fontSize: '9px', color: 'var(--muted)', textAlign: 'center', wordBreak: 'break-all', lineHeight: 1.2 }}>
                            {file.name.length > 12 ? file.name.slice(0, 10) + '…' : file.name}
                          </div>
                        )}
                        {!file.isImage && (
                          <div style={{ fontSize: '8px', color: 'var(--muted)', opacity: 0.7 }}>
                            {formatFileSize(file.size)}
                          </div>
                        )}
                        <button
                          onClick={() => removeFile(file.id)}
                          style={{
                            position: 'absolute', top: 2, right: 2,
                            width: 18, height: 18, borderRadius: '50%',
                            border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff',
                            fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            lineHeight: 1,
                          }}
                          title="Remove file"
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="输入消息... (Enter 发送，Ctrl+V 粘贴图片，或拖拽文件)"
                    style={{
                      width: '100%',
                      minHeight: '56px',
                      resize: 'vertical',
                      border: isDragOver ? '2px dashed var(--accent)' : '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '10px 48px 10px 12px',
                      fontSize: '13px',
                      boxSizing: 'border-box',
                      background: 'var(--paper)',
                      color: 'var(--text)',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      outline: 'none',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-soft)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = isDragOver ? 'var(--accent)' : 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <div style={{ position: 'absolute', right: '8px', bottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {/* File upload button - left of image button */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach file (PDF, DOC, TXT, etc.)"
                      style={{
                        border: 'none',
                        background: 'var(--bg-secondary)',
                        color: 'var(--muted)',
                        borderRadius: '8px',
                        padding: '5px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--muted)'; }}
                    >
                      📎
                    </button>
                    {/* Image upload button */}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      style={{ display: 'none' }}
                      onChange={handleImageUpload}
                    />
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      title="Attach image"
                      style={{
                        border: 'none',
                        background: 'var(--bg-secondary)',
                        color: 'var(--muted)',
                        borderRadius: '8px',
                        padding: '5px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--muted)'; }}
                    >
                      🖼️
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={!inputValue.trim() && attachedFiles.length === 0}
                      style={{
                        border: 'none',
                        background: (inputValue.trim() || attachedFiles.length > 0) ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: (inputValue.trim() || attachedFiles.length > 0) ? '#fff' : 'var(--muted)',
                        borderRadius: '8px',
                        padding: '5px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: (inputValue.trim() || attachedFiles.length > 0) ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                      }}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--muted)' }}>
              <div style={{ fontSize: '32px', opacity: 0.3 }}>💬</div>
              <p style={{ fontSize: '13px', margin: 0 }}>No active conversation</p>
              <button
                onClick={() => setShowNewDialog(true)}
                style={{
                  padding: '8px 20px',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: 'var(--paper)',
                  color: 'var(--accent-strong)',
                  fontSize: '13px',
                  fontWeight: 500,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--paper)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                + New Conversation
              </button>
            </div>
          )}
        </>
      ) : activeTab === 'skills' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <SkillPanel
            globalSkills={globalSkills}
            chapterSkills={chapterSkills}
            onActivateSkill={onActivateSkill}
          />
        </div>
      ) : activeTab === 'rag' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <PaperRagPanel projectPath={projectPath} />
        </div>
      ) : activeTab === 'draw' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <DrawPanel projectPath={projectPath} chapters={chapters} />
        </div>
      ) : activeTab === 'review' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <ReviewReportPanel report={reviewReport} loading={reviewLoading} onRunReview={handleRunReview} />
        </div>
      ) : activeTab === 'anti-ai' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <AntiAiPanel report={antiAiReport} deepReport={deepReport} gptzeroReport={gptzeroReport} loading={antiAiLoading} deepLoading={deepLoading} gptzeroLoading={gptzeroLoading} onRunDetection={handleRunAntiAi} onRunDeepDetection={handleRunDeepDetection} onRunGPTZero={handleRunGPTZero} />
        </div>
      ) : activeTab === 'citations' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <CitationVerificationPanel report={citationReport} loading={citationLoading} onRunVerification={handleRunCitationVerification} onRunCrossCheck={handleRunCrossCheck} projectPath={projectPath} />
        </div>
      ) : activeTab === 'pipeline' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <PipelinePanelV2 projectPath={projectPath || ''} chapterScope={activeFile} />
        </div>
      ) : null
      }

      {showNewDialog && (
        <NewConversationDialog
          chapters={chapters}
          skills={skills}
          projectFiles={projectFiles}
          onSubmit={(data) => { onCreate(data); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
