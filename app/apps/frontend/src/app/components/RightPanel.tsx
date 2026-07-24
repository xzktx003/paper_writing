import React, { lazy, Suspense, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ConversationTabs } from './ConversationTabs';
import { ChatView } from './ChatView';
import { NewConversationDialog } from './NewConversationDialog';
import { SkillPanel } from './SkillPanel';
import { InlineSkillsSelector } from './SkillsSelector';
import { ConversationSummary, Conversation, structuredReview, detectAntiAi, detectAntiAiDeep, detectAntiAiGPTZero, verifyCitations, crossCheckCitations } from '../api/conversationApi';
import { PendingEdit } from '../hooks/useConversations';
import { RagDocumentSelector } from './RagDocumentSelector';
import type { SkillInfo } from '../api/skillApi';
import { getPaperAgentProjectId } from '../utils/previewAssets';
import { managedProjectRequest, projectRequestFromReference } from '../api/projectRequestContext';

const ReviewReportPanel = lazy(() => import('./ReviewReportPanel').then(module => ({ default: module.ReviewReportPanel })));
const AntiAiPanel = lazy(() => import('./AntiAiPanel').then(module => ({ default: module.AntiAiPanel })));
const PipelinePanelV2 = lazy(() => import('./PipelinePanelV2').then(module => ({ default: module.PipelinePanelV2 })));
const CitationVerificationPanel = lazy(() => import('./CitationVerificationPanel').then(module => ({ default: module.CitationVerificationPanel })));
const PaperRagPanel = lazy(() => import('./PaperRagPanel').then(module => ({ default: module.PaperRagPanel })));
const CliTaskPanel = lazy(() => import('./CliTaskPanel').then(module => ({ default: module.CliTaskPanel })));
const DrawPanel = lazy(() => import('./DrawPanel'));

function PanelLoader() {
  const { t } = useTranslation();
  return <div role="status" style={{ padding: 16, color: 'var(--muted)', fontSize: 12 }}>{t('Loading panel…')}</div>;
}

type TabType = 'chat' | 'tasks' | 'rag' | 'draw' | 'review' | 'anti-ai' | 'pipeline' | 'citations';

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
  skills: SkillInfo[];
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
  onSetActiveSkills: (skillNames: string[]) => Promise<void>;
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

export function RightPanel({ conversations, activeConv, loading, uploadProgress, chapters, skills, projectFiles, onSelect, onClose, onCreate, onSend, onUploadAttachment, onRemoveAttachment, onSetRagDocuments, onSetActiveSkills, onRename, globalSkills = [], chapterSkills = [], onActivateSkill = () => {}, projectPath, activeFile, pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
  const { t } = useTranslation();
  const managedProjectId = getPaperAgentProjectId(projectPath);
  const requestContext = useMemo(() => managedProjectId
    ? managedProjectRequest(managedProjectId)
    : projectPath ? projectRequestFromReference(projectPath) : null, [managedProjectId, projectPath]);
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
  const [citationLoadingAction, setCitationLoadingAction] = useState<'verify' | 'cross-check' | null>(null);
  const [citationVerificationTotal, setCitationVerificationTotal] = useState(0);
  const [citationError, setCitationError] = useState<string | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillSyncError, setSkillSyncError] = useState<string | null>(null);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const citationRequestRef = useRef(0);
  const citationAbortRef = useRef<AbortController | null>(null);
  const selectedRagDocs = activeConv?.rag_documents || [];

  // Conversation skills are persistent and must follow the active conversation.
  useEffect(() => {
    setSelectedSkills(activeConv?.active_skills || []);
    setSkillSyncError(null);
  }, [activeConv?.id, activeConv?.active_skills]);

  const handleSkillsChange = useCallback(async (skillNames: string[]) => {
    const previous = selectedSkills;
    setSelectedSkills(skillNames);
    setSkillSyncError(null);
    try {
      await onSetActiveSkills(skillNames);
    } catch (error) {
      setSelectedSkills(previous);
      setSkillSyncError(error instanceof Error ? error.message : t('Failed to save selected Skills.'));
    }
  }, [onSetActiveSkills, selectedSkills, t]);

  useEffect(() => {
    citationAbortRef.current?.abort();
    citationAbortRef.current = null;
    citationRequestRef.current += 1;
    setCitationReport(null);
    setCitationError(null);
    setCitationLoading(false);
    setCitationLoadingAction(null);
    setCitationVerificationTotal(0);
  }, [projectPath]);

  const handleRunReview = useCallback(async () => {
    if (!requestContext) return;
    setReviewLoading(true);
    try { const r = await structuredReview(requestContext); setReviewReport(r); } catch {}
    setReviewLoading(false);
  }, [requestContext]);

  const handleRunAntiAi = useCallback(async () => {
    if (!requestContext) return;
    setAntiAiLoading(true);
    try { const r = await detectAntiAi(requestContext); setAntiAiReport(r); } catch {}
    setAntiAiLoading(false);
  }, [requestContext]);

  const handleRunDeepDetection = useCallback(async () => {
    if (!requestContext) return;
    setDeepLoading(true);
    try { const r = await detectAntiAiDeep(requestContext); setDeepReport(r); } catch {}
    setDeepLoading(false);
  }, [requestContext]);

  const handleRunGPTZero = useCallback(async () => {
    if (!requestContext) return;
    setGptzeroLoading(true);
    try { const r = await detectAntiAiGPTZero(requestContext); setGptzeroReport(r); } catch {}
    setGptzeroLoading(false);
  }, [requestContext]);

  const handleRunCitationVerification = useCallback(async () => {
    if (!requestContext) return;
    const requestId = ++citationRequestRef.current;
    const controller = new AbortController();
    citationAbortRef.current?.abort();
    citationAbortRef.current = controller;
    setCitationLoading(true);
    setCitationLoadingAction('verify');
    setCitationVerificationTotal(0);
    setCitationError(null);
    try {
      const crossCheck = await crossCheckCitations(requestContext, undefined, undefined, controller.signal);
      if (citationRequestRef.current !== requestId) return;
      setCitationVerificationTotal(crossCheck.bibKeys.length);
      const verification = await verifyCitations(requestContext, undefined, controller.signal);
      if (citationRequestRef.current === requestId) setCitationReport({ ...verification, ...crossCheck });
    } catch (error) {
      if (citationRequestRef.current === requestId) {
        setCitationError(error instanceof DOMException && error.name === 'AbortError'
          ? t('Verification cancelled.')
          : error instanceof Error ? error.message : t('Unknown citation verification error'));
      }
    } finally {
      if (citationRequestRef.current === requestId) {
        setCitationLoading(false);
        setCitationLoadingAction(null);
        citationAbortRef.current = null;
      }
    }
  }, [requestContext]);

  const handleRunCrossCheck = useCallback(async () => {
    if (!requestContext) return;
    const requestId = ++citationRequestRef.current;
    const controller = new AbortController();
    citationAbortRef.current?.abort();
    citationAbortRef.current = controller;
    setCitationLoading(true);
    setCitationLoadingAction('cross-check');
    setCitationError(null);
    try {
      const result = await crossCheckCitations(requestContext, undefined, undefined, controller.signal);
      if (citationRequestRef.current === requestId) {
        setCitationReport({
          totalEntries: 0,
          verified: 0,
          titleMatch: 0,
          doiNotFound: 0,
          unverifiable: 0,
          results: [],
          summary: `Cited: ${result.citedKeys.length}, Missing in .bib: ${result.missingInBib.length}, Uncited in .bib: ${result.uncitedInBib.length}`,
          ...result,
        });
      }
    } catch (error) {
      if (citationRequestRef.current === requestId) {
        setCitationError(error instanceof Error ? error.message : t('Unknown citation cross-check error'));
      }
    } finally {
      if (citationRequestRef.current === requestId) {
        setCitationLoading(false);
        setCitationLoadingAction(null);
        citationAbortRef.current = null;
      }
    }
  }, [requestContext]);

  const handleCancelCitationVerification = useCallback(() => {
    citationAbortRef.current?.abort();
    citationAbortRef.current = null;
    citationRequestRef.current += 1;
    setCitationLoading(false);
    setCitationLoadingAction(null);
    setCitationError(t('Verification cancelled.'));
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    if (attachedFiles.some(file => ['reading', 'uploading', 'error'].includes(file.readStatus || ''))) return;
    
    let messageToSend = inputValue.trim();
    
    const transientFiles = attachedFiles.filter(file => !file.attachmentId);
    if (!messageToSend && attachedFiles.some(file => file.attachmentId)) {
      messageToSend = '请确认你已经读取上传的 PDF，并简要说明文档主题。';
    }
    try {
      // Ensure the backend has the latest Skill selection before it assembles the prompt.
      await onSetActiveSkills(selectedSkills);
    } catch (error) {
      setSkillSyncError(error instanceof Error ? error.message : t('Failed to save selected Skills.'));
      return;
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
            ...item, readStatus: 'error', errorMessage: error?.message || t('PDF parsing failed'),
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
          { key: 'chat', label: `💬 ${t('Chat')}` },
          { key: 'tasks', label: `🛠️ ${t('Tasks')}` },
          { key: 'draw', label: `🖼️ ${t('Draw')}` },
          { key: 'rag', label: '🔎 RAG' },
          { key: 'review', label: `📋 ${t('Review')}` },
          { key: 'citations', label: `📚 ${t('Citations')}` },
          { key: 'anti-ai', label: `🔍 ${t('Anti-AI')}` },
          { key: 'pipeline', label: `⚡ ${t('Pipeline')}` },
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
                    {activeConv.context_scope.type === 'chapter' ? `${t('Chapter')}: ${activeConv.context_scope.file}` :
                     activeConv.context_scope.type === 'global' ? t('Global') : t('Free')}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-secondary)', fontSize: '10px', fontWeight: 500 }}>
                    {activeConv.mode}
                  </span>
                  {isDragOver && (
                    <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'var(--accent)', color: '#fff', fontSize: '10px', fontWeight: 600 }}>
                      {t('Drop files here')}
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
                    onChange={handleSkillsChange}
                    onOpenManagement={() => setShowSkillsModal(true)}
                  />
                  {skillSyncError && (
                    <span style={{ color: 'var(--danger)', fontSize: '10px' }} title={skillSyncError}>
                      {t('Failed to save Skill')}
                    </span>
                  )}
                </div>
                {(activeConv.attachments || []).length > 0 && (
                  <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)', marginBottom: 5 }}>{t('Persistent PDF context for this conversation')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {(activeConv.attachments || []).map(attachment => (
                        <span key={attachment.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 6, background: 'var(--paper)', fontSize: 10, color: 'var(--text)' }}>
                          📄 {attachment.name}
                          <button
                            onClick={() => removePersistedAttachment(attachment.id)}
                            title={t('Remove from conversation context')}
                            style={{ border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: 0, lineHeight: 1 }}
                          >×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedRagDocs.length > 0 && (
                  <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-strong)', marginBottom: 5 }}>{t('Persistent RAG documents for this conversation')}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {selectedRagDocs.map(documentPath => (
                        <span key={documentPath} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', borderRadius: 6, background: 'var(--paper)', fontSize: 10, color: 'var(--text)' }}>
                          📚 {documentPath.split('/').pop() || documentPath}
                          <button
                            onClick={() => updateRagDocuments(selectedRagDocs.filter(path => path !== documentPath))}
                            title={t('Stop retrieving this document in the conversation')}
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
                        <span>⏳ {t('Uploading...')} {uploadProgress ? `${uploadProgress.percent}%` : ''}</span>
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
                          <div style={{ fontSize: '9px', color: 'var(--accent)', marginTop: 2 }}>{t('Reading')} {file.readProgress ?? 0}%</div>
                        )}
                        {file.readStatus === 'uploading' && (
                          <div style={{ fontSize: '9px', color: 'var(--accent)', marginTop: 2 }}>
                            {(file.uploadPercent ?? 0) < 100 ? `${t('Upload')} ${file.uploadPercent ?? 0}%` : t('Parsing…')}
                          </div>
                        )}
                        {file.readStatus === 'error' && (
                          <div title={file.errorMessage} style={{ fontSize: '9px', color: '#dc2626', marginTop: 2 }}>{t('Parsing failed')}</div>
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
                          title={t('Remove file')}
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
                        {uploadProgress?.stage === 'uploading' ? t('Uploading attachment...') :
                         uploadProgress?.stage === 'processing' ? t('Attachment uploaded; parsing PDF...') :
                         uploadProgress?.stage === 'sending' ? t('Sending message...') :
                         uploadProgress?.stage === 'response' ? t('Waiting for AI response...') :
                         uploadProgress?.stage === 'streaming' ? t('AI is generating a response...') :
                         uploadProgress?.stage === 'complete' ? t('Complete!') :
                         loading ? t('Processing...') : t('Sending...')}
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
                    placeholder={t('Type a message... (Enter to send, Ctrl+V to paste images, or drag files)')}
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
                      accept="image/*,.pdf,.txt,.md,.markdown,.json,.csv,text/*,application/json,text/csv"
                      style={{ display: 'none' }}
                      onChange={handleFileUpload}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title={t('Attach file (PDF, DOC, TXT, etc.)')}
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
                      title={t('Attach image')}
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
                      {t('Send')}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--muted)' }}>
              <div style={{ fontSize: '32px', opacity: 0.3 }}>💬</div>
              <p style={{ fontSize: '13px', margin: 0 }}>{t('No active conversation')}</p>
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
                + {t('New Conversation')}
              </button>
              <button
                onClick={() => setShowSkillsModal(true)}
                style={{
                  padding: '7px 18px',
                  border: '1px solid var(--border)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: 'var(--panel-muted)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                🧩 {t('Manage Skills')}
              </button>
            </div>
          )}
        </>
      ) : (
        <Suspense fallback={<PanelLoader />}>
          {activeTab === 'tasks' ? (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <CliTaskPanel projectId={managedProjectId} />
            </div>
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
              <CitationVerificationPanel report={citationReport} loading={citationLoading} loadingAction={citationLoadingAction} verificationTotal={citationVerificationTotal} error={citationError} onRunVerification={handleRunCitationVerification} onRunCrossCheck={handleRunCrossCheck} onCancel={handleCancelCitationVerification} projectPath={projectPath} />
            </div>
          ) : activeTab === 'pipeline' ? (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {managedProjectId ? <PipelinePanelV2 projectId={managedProjectId} chapterScope={activeFile} /> : null}
            </div>
          ) : null}
        </Suspense>
      )
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
              <h3 style={{ margin: 0, fontSize: '16px' }}>🧩 {t('Manage Skills')}</h3>
              <button
                onClick={() => setShowSkillsModal(false)}
                style={{
                  padding: '4px 10px', borderRadius: '6px',
                  background: 'var(--bg-secondary)', border: 'none',
                  color: 'var(--muted)', cursor: 'pointer', fontSize: '12px',
                }}
              >
                {t('Close')}
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
