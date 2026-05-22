import React, { useState } from 'react';
import { ConversationTabs } from './ConversationTabs';
import { ChatView } from './ChatView';
import { NewConversationDialog } from './NewConversationDialog';
import { SkillPanel } from './SkillPanel';
import { ConversationSummary, Conversation } from '../api/conversationApi';

type TabType = 'chat' | 'skills';

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
}

export function RightPanel({ conversations, activeConv, loading, chapters, skills, onSelect, onClose, onCreate, onSend, onRename, globalSkills = [], chapterSkills = [], onActivateSkill = () => {} }: Props) {
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('chat');

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
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('chat')}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            borderBottom: activeTab === 'chat' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'chat' ? 'var(--accent-strong)' : 'var(--muted)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab('skills')}
          style={{
            flex: 1,
            padding: '8px 0',
            border: 'none',
            borderBottom: activeTab === 'skills' ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'none',
            color: activeTab === 'skills' ? 'var(--accent-strong)' : 'var(--muted)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          Skills
        </button>
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
              <ChatView messages={activeConv.history} loading={loading} />
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
      ) : (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <SkillPanel
            globalSkills={globalSkills}
            chapterSkills={chapterSkills}
            onActivateSkill={onActivateSkill}
          />
        </div>
      )}

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
