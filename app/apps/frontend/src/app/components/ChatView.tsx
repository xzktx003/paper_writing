import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { InlineDiffViewer } from './InlineDiffViewer';
import { PendingEdit } from '../hooks/useConversations';

interface Message {
  role: string;
  content: string;
}

interface Props {
  messages: Message[];
  loading: boolean;
  streamingText?: string;
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

export function ChatView({ messages, loading, streamingText, pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [expandedThinking, setExpandedThinking] = useState<Set<number>>(new Set());

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
  }, [messages, visibleCount, streamingText]);

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
        <div className="markdown-body" style={{ fontSize: '13px', lineHeight: 1.6 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      );
    }
    return (
      <div>
        {parts.map((part, pIdx) => {
          if (part.type === 'text') {
            return (
              <div key={pIdx} className="markdown-body" style={{ fontSize: '13px', lineHeight: 1.6 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
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
                <span>💭 Thinking{isExpanded ? '' : ` (${part.text.length} chars)`}</span>
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

      {/* Streaming text indicator - shows live text as it arrives */}
      {loading && !streamingText && (
        <div 
          className="animate-fade-in"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            color: 'var(--muted)', 
            fontSize: '13px', 
            padding: '8px 12px' 
          }}
        >
          <div className="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span>Thinking...</span>
        </div>
      )}

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
