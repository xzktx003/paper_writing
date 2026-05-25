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

export function ChatView({ messages, loading, streamingText, pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(0);

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
            <div className="markdown-body" style={{ fontSize: '13px', lineHeight: 1.6 }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
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
          <div className="markdown-body" style={{ fontSize: '13px', lineHeight: 1.6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
            <span className="streaming-cursor" style={{ display: 'inline-block', width: 2, height: 14, background: 'var(--accent)', marginLeft: 2, animation: 'blink 1s step-end infinite' }} />
          </div>
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
