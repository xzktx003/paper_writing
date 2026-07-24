import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { InlineDiffViewer } from './InlineDiffViewer';
import { PendingEdit } from '../hooks/useConversations';
import { useTranslation } from 'react-i18next';
import type { ConversationActivity } from '../utils/conversationActivity';

interface Message {
  role: string;
  content: string;
}

interface Props {
  messages: Message[];
  loading: boolean;
  streamingText?: string;
  activities?: ConversationActivity[];
  pendingEdits?: PendingEdit[];
  onAcceptEdit?: (editId: string) => void;
  onRejectEdit?: (editId: string) => void;
}

/** Splits content into visible text and thinking blocks.
 *  Detects `<thinking>...</thinking> and `/` tags. */
function splitThinking(content: string): Array<{ type: 'text' | 'thinking'; text: string }> {
  const parts: Array<{ type: 'text' | 'thinking'; text: string }> = [];
  let isThinking = false;
  let remaining = content;

  while (remaining.length > 0) {
    if (!isThinking) {
      // Find start of thinking
      const match = remaining.match(/<(?:thinking|think)>/);
      if (match && match.index !== undefined) {
        if (match.index > 0) {
          parts.push({ type: 'text', text: remaining.slice(0, match.index) });
        }
        remaining = remaining.slice(match.index + match[0].length);
        isThinking = true;
      } else {
        parts.push({ type: 'text', text: remaining });
        break;
      }
    } else {
      // Find end of thinking
      const match = remaining.match(/<\/(?:thinking|think)>/);
      if (match && match.index !== undefined) {
        if (match.index > 0) {
          parts.push({ type: 'thinking', text: remaining.slice(0, match.index) });
        }
        remaining = remaining.slice(match.index + match[0].length);
        isThinking = false;
      } else {
        // Unclosed thinking tag (streaming)
        parts.push({ type: 'thinking', text: remaining });
        break;
      }
    }
  }

  return parts;
}

const TOOL_LABELS: Record<string, string> = {
  list_project_files: 'List project files',
  read_project_file: 'Read project file',
  read_chapter: 'Read chapter',
  list_chapters: 'List chapters',
  read_references: 'Read references',
  propose_edit: 'Prepare edit proposal',
  list_code: 'List code files',
  read_code: 'Read code file',
  write_code: 'Write code file',
  run_code: 'Run code',
};

function formatDuration(activity: ConversationActivity) {
  if (!activity.finishedAt) return '';
  const duration = Math.max(0, activity.finishedAt - activity.startedAt);
  return duration < 1000 ? `${duration} ms` : `${(duration / 1000).toFixed(1)} s`;
}

export function ChatView({ messages, loading, streamingText, activities = [], pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(new Set());
  const [workTraceExpanded, setWorkTraceExpanded] = useState(false);
  const firstActivityId = activities[0]?.id;

  // Staggered message reveal animation
  useEffect(() => {
    if (messages.length > visibleCount) {
      const timer = setTimeout(() => {
        setVisibleCount(messages.length);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length, visibleCount]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, visibleCount, streamingText, activities]);

  useEffect(() => {
    setWorkTraceExpanded(false);
  }, [firstActivityId]);

  const toggleThinking = (idx: number) => {
    setExpandedThinking(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const renderContent = (content: string, msgIdx: number) => {
    const parts = splitThinking(content);
    if (parts.every(p => p.type === 'text')) {
      // No thinking content, render normally
      return (
        <div className="markdown-body chat-markdown-body" style={{ fontSize: '13px', lineHeight: 1.6 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{content}</ReactMarkdown>
        </div>
      );
    }
    return (
      <div>
        {parts.map((part, pIdx) => {
          if (part.type === 'text') {
            return (
              <div key={pIdx} className="markdown-body chat-markdown-body" style={{ fontSize: '13px', lineHeight: 1.6 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{part.text}</ReactMarkdown>
              </div>
            );
          }
          // Thinking block
          const isExpanded = expandedThinking.has(msgIdx * 1000 + pIdx);
          return (
            <div key={pIdx} style={{ margin: '6px 0' }}>
              <button
                onClick={() => toggleThinking(msgIdx * 1000 + pIdx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  background: 'var(--bg-secondary)',
                  color: 'var(--muted)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--muted)'; }}
              >
                <span style={{ fontSize: '10px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>▶</span>
                <span>💭 {t('Model-provided reasoning summary')}{isExpanded ? '' : ` (${part.text.length} ${t('characters')})`}</span>
              </button>
              {isExpanded && (
                <div style={{
                  marginTop: '4px',
                  padding: '8px 12px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                  maxHeight: '300px',
                  overflow: 'auto',
                }}>
                  {part.text}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {messages.map((msg, i) => {
        const isNew = i >= visibleCount - 1 && i === messages.length - 1;
        const isUser = msg.role === 'user';
        
        return (
          <div 
            key={i} 
            className={isNew ? 'animate-fade-in-up' : ''}
            style={{
              padding: '10px 14px',
              borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: isUser ? 'var(--accent-soft)' : 'var(--bg-secondary)',
              border: `1px solid ${isUser ? 'var(--accent-soft)' : 'var(--border)'}`,
              maxWidth: '88%',
              marginLeft: isUser ? 'auto' : '0',
              opacity: isNew ? undefined : 1,
              transition: 'opacity 0.3s ease',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 600, color: isUser ? 'var(--accent-strong)' : 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isUser ? 'You' : 'AI'}
            </div>
            {renderContent(msg.content, i)}
          </div>
        );
      })}

      {activities.length > 0 && (() => {
        const current = [...activities].reverse().find(activity => activity.status === 'running') || activities[activities.length - 1];
        const traceId = 'chat-work-trace';
        return (
          <section className="animate-fade-in" style={{ maxWidth: '92%' }} aria-label={t('Work process')}>
            <button
              type="button"
              aria-expanded={workTraceExpanded}
              aria-controls={traceId}
              onClick={() => setWorkTraceExpanded(value => !value)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg-secondary)', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span aria-hidden="true" style={{ transform: workTraceExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
              {loading && <span className="typing-indicator" aria-hidden="true"><span></span><span></span><span></span></span>}
              <span style={{ fontSize: 12, fontWeight: 650 }}>{t('Work process')}</span>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>· {t('{{count}} steps', { count: activities.length })}</span>
              {current && (
                <span style={{ marginLeft: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: current.status === 'failed' ? '#ef4444' : 'var(--muted)' }}>
                  {current.kind === 'tool' ? t(TOOL_LABELS[current.toolName || ''] || current.toolName || current.title) : t(current.title)}
                </span>
              )}
            </button>
            {workTraceExpanded && (
              <ol id={traceId} style={{ listStyle: 'none', margin: '6px 0 0', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--panel-muted)' }}>
                {activities.map(activity => {
                  const label = activity.kind === 'tool'
                    ? t(TOOL_LABELS[activity.toolName || ''] || activity.toolName || activity.title)
                    : t(activity.title);
                  return (
                    <li key={activity.id} style={{ display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto', gap: 7, padding: '6px 0', borderBottom: '1px solid color-mix(in srgb, var(--border) 55%, transparent)' }}>
                      <span aria-hidden="true" style={{ color: activity.status === 'success' ? '#22c55e' : activity.status === 'failed' ? '#ef4444' : 'var(--accent)' }}>
                        {activity.status === 'success' ? '✓' : activity.status === 'failed' ? '!' : '●'}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 550 }}>{label}</div>
                        {activity.detail && <div style={{ marginTop: 2, fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{activity.detail}</div>}
                        {activity.resultDetail && <div style={{ marginTop: 2, fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{activity.resultDetail}</div>}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{formatDuration(activity)}</span>
                    </li>
                  );
                })}
                <li style={{ paddingTop: 7, fontSize: 10, color: 'var(--muted)' }}>{t('This shows verifiable execution activity, not private model reasoning.')}</li>
              </ol>
            )}
          </section>
        );
      })()}

      {/* Streaming cursor */}
      {loading && streamingText && (
        <div style={{
          padding: '10px 14px',
          borderRadius: '14px 14px 14px 4px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          maxWidth: '88%',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--muted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI</div>
          {renderContent(streamingText, -1)}
          <span className="streaming-cursor" style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--accent)', marginLeft: 2, animation: 'blink 1s step-end infinite' }} />
        </div>
      )}

      {/* Pending edits from propose_edit tool */}
      {pendingEdits.filter(e => e.status === 'pending').map(edit => (
        <div key={edit.id} className="animate-fade-in" style={{ maxWidth: '95%', margin: '4px 0' }}>
          <InlineDiffViewer
            original={edit.original}
            proposed={edit.new_content}
            filename={edit.filename}
            stats={edit.stats}
            error={edit.error}
            compact
            onAccept={() => onAcceptEdit?.(edit.id)}
            onReject={() => onRejectEdit?.(edit.id)}
          />
        </div>
      ))}

      {/* Accepted/rejected edits (collapsed) */}
      {pendingEdits.filter(e => e.status !== 'pending').map(edit => (
        <div key={edit.id} style={{ padding: '6px 12px', fontSize: '11px', color: 'var(--muted)', borderRadius: '6px', background: 'var(--bg-secondary)', maxWidth: '88%' }}>
          <span style={{ color: edit.status === 'accepted' ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
            {edit.status === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
          </span>
          {' '}{edit.filename}
          {edit.status === 'accepted' && <span style={{ marginLeft: 4 }}>+{edit.stats.added} -{edit.stats.removed}</span>}
        </div>
      ))}

      <div ref={bottomRef} />
    </div>
  );
}
