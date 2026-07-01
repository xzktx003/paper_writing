import React, { useState, useCallback, useRef, useEffect } from 'react';
import { ConversationTabs } from './ConversationTabs';
import { ChatView } from './ChatView';
import { NewConversationDialog } from './NewConversationDialog';
import { SkillPanel } from './SkillPanel';
import { InlineSkillsSelector } from './SkillsSelector';
import { ReviewReportPanel } from './ReviewReportPanel';
import { AntiAiPanel } from './AntiAiPanel';
import { PipelinePanelV2 } from './PipelinePanelV2';
import { CitationVerificationPanel } from './CitationVerificationPanel';
import { PaperRagPanel } from './PaperRagPanel';
import DrawPanel from './DrawPanel';
import { ConversationSummary, Conversation, structuredReview, detectAntiAi, detectAntiAiDeep, detectAntiAiGPTZero, verifyTexCitations, crossCheckCitations } from '../api/conversationApi';
import { PendingEdit } from '../hooks/useConversations';
import { RagDocumentSelector } from './RagDocumentSelector';

type TabType = 'chat' | 'rag' | 'draw' | 'review' | 'anti-ai' | 'pipeline' | 'citations';

interface AttachedFile {
  id: string;
  dataUrl: string;
  name: string;
  type: string;
  isImage: boolean;
  size: number;
  attachmentId?: string;
  readProgress?: number;
  uploadPercent?: number;
  readStatus?: 'reading' | 'uploading' | 'ready' | 'error';
  errorMessage?: string;
}

interface Props {
  conversations: ConversationSummary[];
  activeConv: Conversation | null;
  loading: boolean;
  uploadProgress?: { percent: number; stage: string } | null;
  chapters: { file: string }[];
  skills: { name: string; display_name: string }[];
  projectFiles?: { path: string; type: 'file' | 'dir' }[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: (data: any) => void;
  onSend: (message: string, files?: AttachedFile[]) => void;
  onUploadAttachment: (
    file: { dataUrl: string; name: string; type: string; isImage: boolean; size: number },
    onProgress?: (percent: number) => void
  ) => Promise<{ id: string; name: string }>;
  onRemoveAttachment: (attachmentId: string) => Promise<void>;
  onSetRagDocuments: (documentPaths: string[]) => Promise<void>;
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

export function RightPanel({ conversations, activeConv, loading, uploadProgress, chapters, skills, projectFiles, onSelect, onClose, onCreate, onSend, onUploadAttachment, onRemoveAttachment, onSetRagDocuments, onRename, globalSkills = [], chapterSkills = [], onActivateSkill = () => {}, projectPath, activeFile, pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
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
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedRagDocs = activeConv?.rag_documents || [];

  // Clear selected skills when switching tabs
  useEffect(() => {
    setSelectedSkills([]);
  }, [activeTab]);

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

  const handleSend = async () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    if (attachedFiles.some(file => ['reading', 'uploading', 'error'].includes(file.readStatus || ''))) return;
    
    let messageToSend = inputValue.trim();
    
    const transientFiles = attachedFiles.filter(file => !file.attachmentId);
    if (!messageToSend && attachedFiles.some(file => file.attachmentId)) {
      messageToSend = '请确认你已经读取上传的 PDF，并简要说明文档主题。';
    }
    onSend(messageToSend, transientFiles.length > 0 ? transientFiles : undefined);
    setInputValue('');
    setAttachedFiles([]);
    // Keep selected docs for next message
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

  /** Add files to the attached files list and expose local read progress. */
  const addFilesToList = (files: File[]) => {
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const id = 'file-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      setAttachedFiles(prev => [...prev, {
        id, dataUrl: '', name: file.name, type: file.type, isImage, size: file.size,
        readProgress: 0, readStatus: 'reading',
      }]);

      const reader = new FileReader();
      reader.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const readProgress = Math.round((event.loaded / event.total) * 100);
        setAttachedFiles(prev => prev.map(item => item.id === id ? { ...item, readProgress } : item));
      };
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        const isPdf = file.type.toLowerCase().includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
        setAttachedFiles(prev => prev.map(item => item.id === id ? {
          ...item, dataUrl, readProgress: 100, readStatus: isPdf ? 'uploading' : 'ready', uploadPercent: 0,
        } : item));
        if (!isPdf) return;
        try {
          const attachment = await onUploadAttachment(
            { dataUrl, name: file.name, type: file.type || 'application/pdf', isImage: false, size: file.size },
            uploadPercent => setAttachedFiles(prev => prev.map(item => item.id === id ? { ...item, uploadPercent } : item))
          );
          setAttachedFiles(prev => prev.map(item => item.id === id ? {
            ...item, attachmentId: attachment.id, uploadPercent: 100, readStatus: 'ready',
          } : item));
        } catch (error: any) {
          setAttachedFiles(prev => prev.map(item => item.id === id ? {
            ...item, readStatus: 'error', errorMessage: error?.message || 'PDF 解析失败',
          } : item));
        }
      };
      reader.onerror = () => {
        setAttachedFiles(prev => prev.map(item => item.id === id ? {
          ...item, readStatus: 'error',
        } : item));
      };
      reader.readAsDataURL(file);
    }
  };
  const removeFile = async (id: string) => {
    const file = attachedFiles.find(item => item.id === id);
    if (file?.attachmentId) await onRemoveAttachment(file.attachmentId).catch(() => {});
    setAttachedFiles(prev => prev.filter(f => f.id !== id));
  };

  const removePersistedAttachment = async (attachmentId: string) => {
    await onRemoveAttachment(attachmentId);
    setAttachedFiles(prev => prev.filter(file => file.attachmentId !== attachmentId));
  };

  const updateRagDocuments = (documentPaths: string[]) => {
    onSetRagDocuments(documentPaths).catch(error => {
      console.error('Failed to update conversation RAG documents:', error);
    });
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
          { key: 'draw', label: '🖼️ Draw' },
          { key: 'rag', label: '🔎 RAG' },
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
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                  {/* RAG Document selector */}
                  <RagDocumentSelector
                    projectPath={projectPath}
                    selectedDocs={selectedRagDocs}
                    onChange={updateRagDocuments}
                  />
                  {/* Skills selector with categories */}
                  <InlineSkillsSelector
                    skills={skills}
                    selectedSkills={selectedSkills}
                    onChange={setSelectedSkills}
                    onOpenManagement={() => setShowSkillsModal(true)}
                  />
                </div>
                {(activeConv.attachments || []).length > 0 && (
                  <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)', marginBottom: 5 }}>本对话持续使用的 PDF 上下文</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(activeConv.attachments || []).map(attachment => (
                        <span key={attachment.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 6, background: 'var(--paper)', fontSize: 10, color: 'var(--text)' }}>
                          📄 {attachment.name}
                          <button
                            onClick={() => removePersistedAttachment(attachment.id)}
                            title="从对话上下文移除"
                            style={{ border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRagDocs.length > 0 && (
                  <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)', marginBottom: 5 }}>本对话持续检索的 RAG 文档</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {selectedRagDocs.map(documentPath => (
                        <span key={documentPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 6, background: 'var(--paper)', fontSize: 10, color: 'var(--text)' }}>
                          📚 {documentPath.split('/').pop() || documentPath}
                          <button
                            onClick={() => updateRagDocuments(selectedRagDocs.filter(path => path !== documentPath))}
                            title="停止在本对话中检索此文档"
                            style={{ border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* File previews with loading indicator */}
                {attachedFiles.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {loading && (
                      <div style={{ 
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--accent-soft)',
                        border: '1px solid var(--accent)',
                        fontSize: '12px',
                        color: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <span>⏳ 上传中 {uploadProgress ? `${uploadProgress.percent}%` : ''}...</span>
                      </div>
                    )}
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
                        {file.isImage && file.dataUrl ? (
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
                        {file.readStatus === 'reading' && (
                          <div style={{ fontSize: '9px', color: 'var(--accent)', marginTop: 2 }}>读取 {file.readProgress ?? 0}%</div>
                        )}
                        {file.readStatus === 'uploading' && (
                          <div style={{ fontSize: '9px', color: 'var(--accent)', marginTop: 2 }}>
                            {(file.uploadPercent ?? 0) < 100 ? `上传 ${file.uploadPercent ?? 0}%` : '解析中…'}
                          </div>
                        )}
                        {file.readStatus === 'error' && (
                          <div title={file.errorMessage} style={{ fontSize: '9px', color: '#dc2626', marginTop: 2 }}>解析失败</div>
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
                  {/* Loading/Progress indicator */}
                  {(loading || uploadProgress) && (
                    <div style={{
                      marginBottom: '8px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, var(--accent-soft), #fef3c7)',
                      border: '2px solid var(--accent)',
                      fontSize: '13px',
                      color: 'var(--accent-strong)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}>
                      <span style={{ fontSize: '18px' }}>{uploadProgress?.percent === 100 ? '✅' : '⏳'}</span>
                      <span>
                        {uploadProgress?.stage === 'uploading' ? '正在上传附件...' :
                         uploadProgress?.stage === 'processing' ? '附件上传完成，正在解析 PDF...' :
                         uploadProgress?.stage === 'sending' ? '正在发送消息...' :
                         uploadProgress?.stage === 'response' ? '等待 AI 响应...' :
                         uploadProgress?.stage === 'streaming' ? 'AI 正在生成回复...' :
                         uploadProgress?.stage === 'complete' ? '完成!' :
                         loading ? '处理中...' : '发送中...'}
                      </span>
                      {uploadProgress && (
                        <span style={{ marginLeft: 'auto', fontWeight: 'bold' }}>{uploadProgress.percent}%</span>
                      )}
                    </div>
                  )}
                  {uploadProgress?.stage === 'uploading' && (
                    <div style={{ height: 4, margin: '-8px 0 8px', borderRadius: 999, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                      <div style={{ width: String(uploadProgress.percent) + '%', height: '100%', background: 'var(--accent)', transition: 'width 120ms linear' }} />
                    </div>
                  )}
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
                      disabled={(!inputValue.trim() && attachedFiles.length === 0) || attachedFiles.some(file => ['reading', 'uploading', 'error'].includes(file.readStatus || '')) || loading}
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
      ) : activeTab === 'rag' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <PaperRagPanel projectPath={projectPath} />
        </div>
      ) : activeTab === 'draw' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <DrawPanel projectPath={projectPath} chapters={chapters} skills={skills} />
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

      {/* Skills management modal */}
      {showSkillsModal && (
        <div 
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowSkillsModal(false)}
        >
          <div 
            style={{
              background: 'var(--panel)', borderRadius: '12px',
              padding: '20px', width: '80%', maxWidth: '600px',
              maxHeight: '80vh', overflow: 'auto',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px' }}>🧩 管理 Skills</h3>
              <button
                onClick={() => setShowSkillsModal(false)}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  background: 'var(--bg-secondary)', border: 'none',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '12px',
                }}
              >
                关闭
              </button>
            </div>
            <SkillPanel
              globalSkills={globalSkills}
              chapterSkills={chapterSkills}
              onActivateSkill={onActivateSkill}
            />
          </div>
        </div>
      )}
    </div>
  );
}
