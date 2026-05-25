import React, { useState, useCallback } from 'react';
import { ConversationTabs } from './ConversationTabs';
import { ChatView } from './ChatView';
import { NewConversationDialog } from './NewConversationDialog';
import { SkillPanel } from './SkillPanel';
import { ReviewReportPanel } from './ReviewReportPanel';
import { AntiAiPanel } from './AntiAiPanel';
import { PipelinePanel } from './PipelinePanel';
import { PipelinePanelV2 } from './PipelinePanelV2';
import { ConversationSummary, Conversation, structuredReview, detectAntiAi, detectAntiAiDeep, detectAntiAiGPTZero } from '../api/conversationApi';
import { PendingEdit } from '../hooks/useConversations';

type TabType = 'chat' | 'skills' | 'review' | 'anti-ai' | 'pipeline';

interface Props {
  conversations: ConversationSummary[];
  activeConv: Conversation | null;
  loading: boolean;
  chapters: { file: string }[];
  skills: { name: string; display_name: string }[];
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onCreate: (data: any) => void;
  onSend: (message: string) => void;
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

export function RightPanel({ conversations, activeConv, loading, chapters, skills, onSelect, onClose, onCreate, onSend, onRename, globalSkills = [], chapterSkills = [], onActivateSkill = () => {}, projectPath, activeFile, pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
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

  const handleRunReview = useCallback(async () => {
    if (!projectPath) return;
    setReviewLoading(true);
    try { const r = await structuredReview(projectPath, activeFile); setReviewReport(r); } catch {}
    setReviewLoading(false);
  }, [projectPath, activeFile]);

  const handleRunAntiAi = useCallback(async () => {
    if (!projectPath) return;
    setAntiAiLoading(true);
    try { const r = await detectAntiAi(projectPath, undefined, activeFile); setAntiAiReport(r); } catch {}
    setAntiAiLoading(false);
  }, [projectPath, activeFile]);

  const handleRunDeepDetection = useCallback(async () => {
    if (!projectPath) return;
    setDeepLoading(true);
    try { const r = await detectAntiAiDeep(projectPath, undefined, activeFile); setDeepReport(r); } catch {}
    setDeepLoading(false);
  }, [projectPath, activeFile]);

  const handleRunGPTZero = useCallback(async () => {
    if (!projectPath) return;
    setGptzeroLoading(true);
    try { const r = await detectAntiAiGPTZero(projectPath, undefined, activeFile); setGptzeroReport(r); } catch {}
    setGptzeroLoading(false);
  }, [projectPath, activeFile]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    onSend(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)' }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, overflow: 'auto' }}>
        {([
          { key: 'chat', label: '💬 Chat' },
          { key: 'skills', label: '🧩 Skills' },
          { key: 'review', label: '📋 Review' },
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
                <div style={{ position: 'relative' }}>
                  <textarea
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message... (Enter to send)"
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
                  <button
                    onClick={handleSend}
                    disabled={!inputValue.trim()}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      bottom: '8px',
                      border: 'none',
                      background: inputValue.trim() ? 'var(--accent)' : 'var(--bg-secondary)',
                      color: inputValue.trim() ? '#fff' : 'var(--muted)',
                      borderRadius: '8px',
                      padding: '5px 12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: inputValue.trim() ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                    }}
                  >
                    Send
                  </button>
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
      ) : activeTab === 'review' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <ReviewReportPanel report={reviewReport} loading={reviewLoading} onRunReview={handleRunReview} />
        </div>
      ) : activeTab === 'anti-ai' ? (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <AntiAiPanel report={antiAiReport} deepReport={deepReport} gptzeroReport={gptzeroReport} loading={antiAiLoading} deepLoading={deepLoading} gptzeroLoading={gptzeroLoading} onRunDetection={handleRunAntiAi} onRunDeepDetection={handleRunDeepDetection} onRunGPTZero={handleRunGPTZero} />
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
          onSubmit={(data) => { onCreate(data); setShowNewDialog(false); }}
          onCancel={() => setShowNewDialog(false)}
        />
      )}
    </div>
  );
}
