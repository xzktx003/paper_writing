import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ConversationSummary } from '../api/conversationApi';

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onRename?: (id: string, newName: string) => void;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  convId: string;
  convName: string;
}

export function ConversationTabs({ conversations, activeId, onSelect, onClose, onNew, onRename }: Props) {
  const { t } = useTranslation();
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, convId: '', convName: '' });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (renaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(prev => ({ ...prev, visible: false }));
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, conv: ConversationSummary) => {
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, convId: conv.id, convName: conv.name });
  };

  const handleRenameStart = () => {
    setRenameValue(contextMenu.convName);
    setRenaming(contextMenu.convId);
    setContextMenu(prev => ({ ...prev, visible: false }));
  };

  const handleRenameSubmit = () => {
    if (renaming && renameValue.trim() && onRename) {
      onRename(renaming, renameValue.trim());
    }
    setRenaming(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') setRenaming(null);
  };

  return (
    <>
      <div role="tablist" aria-label={t('Conversations')} style={{ display: 'flex', alignItems: 'center', gap: '2px', overflow: 'auto', padding: '0 6px', width: '100%' }}>
        {conversations.map(conv => (
          <div
            key={conv.id}
            role="tab"
            tabIndex={conv.id === activeId ? 0 : -1}
            aria-selected={conv.id === activeId}
            data-testid={`conversation-tab-${conv.id}`}
            onClick={() => onSelect(conv.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(conv.id);
              }
            }}
            onContextMenu={(e) => handleContextMenu(e, conv)}
            style={{
              padding: '5px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              background: conv.id === activeId ? 'var(--paper)' : 'transparent',
              borderBottom: conv.id === activeId ? '2px solid var(--accent)' : '2px solid transparent',
              color: conv.id === activeId ? 'var(--accent-strong)' : 'var(--text-secondary)',
              fontWeight: conv.id === activeId ? 500 : 400,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease',
            }}
          >
            {renaming === conv.id ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleRenameKeyDown}
                onClick={e => e.stopPropagation()}
                style={{ width: '80px', fontSize: '12px', border: '1px solid var(--accent)', borderRadius: '4px', padding: '1px 4px', outline: 'none', background: 'var(--paper)', color: 'var(--text)' }}
              />
            ) : (
              <>
                {conv.name}
                <button
                  type="button"
                  aria-label={t('Delete {{name}}', { name: conv.name })}
                  onClick={(e) => { e.stopPropagation(); onClose(conv.id); }}
                  style={{ marginLeft: '6px', color: 'var(--muted)', cursor: 'pointer', opacity: 0.6, border: 0, background: 'none', padding: 0 }}
                >×</button>
              </>
            )}
          </div>
        ))}
        <button type="button" aria-label={t('New conversation')} onClick={onNew} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', padding: '2px 8px', color: 'var(--accent)', fontWeight: 600 }}>+</button>
      </div>

      {contextMenu.visible && (
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: 'var(--shadow)',
            zIndex: 9999,
            minWidth: '120px',
            fontSize: '13px',
            overflow: 'hidden',
          }}
        >
          <div onClick={handleRenameStart} style={{ padding: '8px 14px', cursor: 'pointer', color: 'var(--text)', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {t('Rename')}
          </div>
          <div onClick={() => { onClose(contextMenu.convId); setContextMenu(prev => ({ ...prev, visible: false })); }} style={{ padding: '8px 14px', cursor: 'pointer', color: 'var(--danger)', transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
            {t('Delete')}
          </div>
        </div>
      )}
    </>
  );
}
