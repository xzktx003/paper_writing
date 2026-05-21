import React, { useState } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { MarkdownPreview } from './MarkdownPreview';

interface OpenFile {
  filename: string;
  content: string;
  type: 'chapter' | 'code' | 'other';
  dirty: boolean;
}

interface Props {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onFileChange: (index: number, content: string) => void;
  onTabSelect: (index: number) => void;
  onTabClose: (index: number) => void;
  terminalVisible: boolean;
  onToggleTerminal: () => void;
}

export function CenterPanel({ openFiles, activeFileIndex, onFileChange, onTabSelect, onTabClose, terminalVisible, onToggleTerminal }: Props) {
  const [showPreview, setShowPreview] = useState(true);
  const activeFile = openFiles?.[activeFileIndex];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: '36px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '2px', overflow: 'auto' }}>
        {(openFiles || []).map((file, i) => (
          <div
            key={file.filename}
            onClick={() => onTabSelect(i)}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '4px 4px 0 0',
              background: i === activeFileIndex ? '#fff' : '#f5f5f5',
              borderBottom: i === activeFileIndex ? '2px solid #1976d2' : 'none',
            }}
          >
            {file.filename}{file.dirty ? ' •' : ''}
            <span onClick={(e) => { e.stopPropagation(); onTabClose(i); }} style={{ marginLeft: '6px', color: '#999' }}>×</span>
          </div>
        ))}
        {activeFile && activeFile.type === 'chapter' && (
          <button onClick={() => setShowPreview(!showPreview)} style={{ marginLeft: '8px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', padding: '2px 6px', cursor: 'pointer', background: showPreview ? '#e3f2fd' : '#fff' }}>
            Preview
          </button>
        )}
        <button onClick={onToggleTerminal} style={{ marginLeft: 'auto', fontSize: '11px', border: 'none', background: 'none', cursor: 'pointer' }}>
          {terminalVisible ? '▼ Terminal' : '▲ Terminal'}
        </button>
      </div>

      {activeFile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <MarkdownEditor
              content={activeFile.content}
              onChange={(c) => onFileChange(activeFileIndex, c)}
            />
          </div>
          {showPreview && activeFile.type === 'chapter' && (
            <>
              <div style={{ height: '1px', background: '#e0e0e0' }} />
              <div style={{ flex: 1, overflow: 'auto' }}>
                <MarkdownPreview content={activeFile.content} />
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          Open a file from the project tree
        </div>
      )}

      {terminalVisible && (
        <div style={{ height: '250px', borderTop: '1px solid #e0e0e0', background: '#1e1e1e', color: '#d4d4d4', padding: '8px', fontFamily: 'monospace', fontSize: '13px' }}>
          Terminal (connecting...)
        </div>
      )}
    </div>
  );
}
