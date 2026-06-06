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
import { ConversationSummary, Conversation, structuredReview, detectAntiAi, detectAntiAiDeep, detectAntiAiGPTZero, verifyTexCitations, crossCheckCitations } from '../api/conversationApi';
import { PendingEdit } from '../hooks/useConversations';

type TabType = 'chat' | 'skills' | 'rag' | 'review' | 'anti-ai' | 'pipeline' | 'citations';

interface AttachedImage {
  id: string;
  dataUrl: string;
  name: string;
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
  onSend: (message: string, images?: AttachedImage[]) => void;
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
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    if (!inputValue.trim() && attachedImages.length === 0) return;
    onSend(inputValue.trim(), attachedImages.length > 0 ? attachedImages : undefined);
    setInputValue('');
    setAttachedImages([]);
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
          setAttachedImages(prev => [...prev, {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            dataUrl: reader.result as string,
            name: `paste-${Date.now()}.png`,
          }]);
        };
        reader.readAsDataURL(file);
      }
    }
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImages(prev => [...prev, {
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          dataUrl: reader.result as string,
          name: file.name,
        }]);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be re-selected
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const removeImage = (id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)' }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, overflow: 'auto' }}>
        {([
          { key: 'chat', label: '💬 Chat' },
          { key: 'skills', label: '🧩 Skills' },
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
              <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', background: 'var(--panel-muted)' }}>
                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'var(--accent-soft)', color: 'var(--accent-strong)', fontSize: '10px', fontWeight: 600 }}>
                    {activeConv.context_scope.type === 'chapter' ? `Ch: ${activeConv.context_scope.file}` :
                     activeConv.context_scope.type === 'global' ? 'Global' : 'Free'}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-secondary)', fontSize: '10px', fontWeight: 500 }}>
                    {activeConv.mode}
                  </span>
                </div>
                {/* Image previews */}
                {attachedImages.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    {attachedImages.map(img => (
                      <div key={img.id} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                        <img src={img.dataUrl} alt={img.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button
                          onClick={() => removeImage(img.id)}
                          style={{
                            position: 'absolute', top: 2, right: 2,
                            width: 18, height: 18, borderRadius: '50%',
                            border: 'none', background: 'rgba(0,0,0,0.6)', color: '#fff',
                            fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            lineHeight: 1,
                          }}
                          title="Remove image"
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
                    placeholder="Type a message... (Enter to send, Ctrl+V to paste image)"
                    style={{
                      width: '100%',
                      minHeight: '56px',
                      resize: 'vertical',
                      border: '1px solid var(--border)',
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
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <div style={{ position: 'absolute', right: '8px', bottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
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
                      disabled={!inputValue.trim() && attachedImages.length === 0}
                      style={{
                        border: 'none',
                        background: (inputValue.trim() || attachedImages.length > 0) ? 'var(--accent)' : 'var(--bg-secondary)',
                        color: (inputValue.trim() || attachedImages.length > 0) ? '#fff' : 'var(--muted)',
                        borderRadius: '8px',
                        padding: '5px 12px',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: (inputValue.trim() || attachedImages.length > 0) ? 'pointer' : 'default',
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
