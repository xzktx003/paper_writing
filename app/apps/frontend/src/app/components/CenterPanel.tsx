import React, { useState, useCallback, useRef } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { RenderedDocumentEditor } from './RenderedDocumentEditor';
import { MarkdownPreview } from './MarkdownPreview';
import { LatexPreview } from './LatexPreview';
import { TerminalPanel } from './TerminalPanel';
import { getOpenPrismProjectId, isImagePath, isPdfPath, isPreviewableTextPath } from '../utils/previewAssets';

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
  projectPath?: string;
}

export function CenterPanel({ openFiles, activeFileIndex, onFileChange, onTabSelect, onTabClose, terminalVisible, onToggleTerminal, projectPath }: Props) {
  const [editorViewMode, setEditorViewMode] = useState<'source' | 'split' | 'live'>('split');
  const [terminalHeight, setTerminalHeight] = useState(250);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [editorRatio, setEditorRatio] = useState(0.5);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const activeFile = openFiles?.[activeFileIndex];
  const projectId = getOpenPrismProjectId(projectPath);
  const activeIsImage = !!activeFile && isImagePath(activeFile.filename);
  const activeIsPdf = !!activeFile && isPdfPath(activeFile.filename);
  const activeIsText = !!activeFile && isPreviewableTextPath(activeFile.filename);

  const handleTerminalResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientX !== undefined ? e.clientY : 0;
    const startH = terminalHeight;
    const onMove = (ev: MouseEvent) => {
      const newH = Math.max(100, Math.min(800, startH + (startY - ev.clientY)));
      setTerminalHeight(newH);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [terminalHeight]);

  const handleEditorPreviewResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = editorAreaRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const ratio = (ev.clientY - rect.top) / rect.height;
      setEditorRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const termH = terminalMaximized ? '100%' : terminalHeight;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Tab bar */}
      {!terminalMaximized && (
        <div style={{ height: '38px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '2px', overflow: 'auto', flexShrink: 0, background: 'var(--panel-muted)' }}>
          {(openFiles || []).map((file, i) => (
            <div
              key={file.filename}
              onClick={() => onTabSelect(i)}
              style={{
                padding: '5px 14px',
                fontSize: '12px',
                cursor: 'pointer',
                borderRadius: '6px 6px 0 0',
                background: i === activeFileIndex ? 'var(--paper)' : 'transparent',
                borderBottom: i === activeFileIndex ? '2px solid var(--accent)' : '2px solid transparent',
                color: i === activeFileIndex ? 'var(--accent-strong)' : 'var(--text-secondary)',
                fontWeight: i === activeFileIndex ? 500 : 400,
                transition: 'all 0.15s ease',
              }}
            >
              {file.filename}{file.dirty ? ' •' : ''}
              <span onClick={(e) => { e.stopPropagation(); onTabClose(i); }} style={{ marginLeft: '8px', color: 'var(--muted)', cursor: 'pointer', opacity: 0.6, fontSize: '13px' }}>×</span>
            </div>
          ))}
          {activeFile && activeFile.type === 'chapter' && (
            <div style={{ marginLeft: '8px', display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--paper)' }} title="Editor view mode">
              {(['source', 'split', 'live'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setEditorViewMode(mode)}
                  style={{
                    fontSize: '11px',
                    border: 'none',
                    borderRight: mode === 'live' ? 'none' : '1px solid var(--border)',
                    padding: '3px 9px',
                    cursor: 'pointer',
                    background: editorViewMode === mode ? 'var(--accent-soft)' : 'transparent',
                    color: editorViewMode === mode ? 'var(--accent-strong)' : 'var(--text-secondary)',
                    fontWeight: editorViewMode === mode ? 600 : 500,
                    transition: 'all 0.15s',
                    textTransform: 'capitalize',
                  }}
                >
                  {mode === 'live' ? 'Rendered' : mode}
                </button>
              ))}
            </div>
          )}
          <button onClick={onToggleTerminal} style={{ marginLeft: 'auto', fontSize: '11px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '4px', transition: 'color 0.15s' }}>
            {terminalVisible ? '▼ Terminal' : '▲ Terminal'}
          </button>
        </div>
      )}

      {/* Editor + Preview area */}
      {!terminalMaximized && (
        activeFile ? (
          <div ref={editorAreaRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {activeIsImage ? (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--paper)', overflow: 'auto' }}>
                {projectId ? (
                  <img
                    src={`/api/projects/${encodeURIComponent(projectId)}/blob?${new URLSearchParams({ path: activeFile.filename }).toString()}`}
                    alt={activeFile.filename}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, background: '#fff' }}
                  />
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>Image preview is available for project files.</div>
                )}
              </div>
            ) : activeIsPdf ? (
              <div style={{ flex: 1, minHeight: 0, background: 'var(--paper)', overflow: 'hidden' }}>
                {projectId ? (
                  <object
                    data={`/api/projects/${encodeURIComponent(projectId)}/blob?${new URLSearchParams({ path: activeFile.filename }).toString()}`}
                    type="application/pdf"
                    style={{ width: '100%', height: '100%', border: 0 }}
                  >
                    <div style={{ padding: 24, color: 'var(--muted)', fontSize: 13 }}>PDF preview is not available in this browser.</div>
                  </object>
                ) : (
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>PDF preview is available for project files.</div>
                )}
              </div>
            ) : !activeIsText ? (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--paper)', color: 'var(--muted)', fontSize: 13 }}>
                No inline preview for {activeFile.filename}
              </div>
            ) : (
              <>
                <div style={{ height: editorViewMode === 'split' && activeFile.type === 'chapter' ? `${editorRatio * 100}%` : '100%', overflow: 'hidden' }}>
                  {editorViewMode === 'live' && activeFile.type === 'chapter' ? (
                    <RenderedDocumentEditor
                      content={activeFile.content}
                      onChange={(c) => onFileChange(activeFileIndex, c)}
                      format={activeFile.filename.endsWith('.tex') ? 'latex' : 'markdown'}
                      projectId={projectId}
                      currentFile={activeFile.filename}
                    />
                  ) : (
                    <MarkdownEditor
                      content={activeFile.content}
                      onChange={(c) => onFileChange(activeFileIndex, c)}
                    />
                  )}
                </div>
                {editorViewMode === 'split' && activeFile.type === 'chapter' && (
                  <>
                    <div
                      onMouseDown={handleEditorPreviewResize}
                      style={{ height: '5px', cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, position: 'relative', transition: 'background 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
                    >
                      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '30px', height: '3px', borderRadius: '2px', background: 'var(--muted)', opacity: 0.4 }} />
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', background: 'var(--paper)' }}>
                      {activeFile.filename.endsWith('.tex') ? (
                        <LatexPreview content={activeFile.content} projectId={projectId} currentFile={activeFile.filename} />
                      ) : (
                        <MarkdownPreview content={activeFile.content} projectId={projectId} currentFile={activeFile.filename} />
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--muted)' }}>
            <div style={{ fontSize: '36px', opacity: 0.25 }}>📄</div>
            <p style={{ margin: 0, fontSize: '13px' }}>Open a file from the project tree</p>
          </div>
        )
      )}

      {/* Terminal */}
      {terminalVisible && (
        <>
          {!terminalMaximized && (
            <div
              onMouseDown={handleTerminalResize}
              style={{ height: '5px', cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, position: 'relative', transition: 'background 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
            >
              <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '30px', height: '3px', borderRadius: '2px', background: 'var(--muted)', opacity: 0.4 }} />
            </div>
          )}
          <div className="zone-terminal" style={{ height: terminalMaximized ? '100%' : terminalHeight, flex: terminalMaximized ? 1 : undefined, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
            <div className="zone-header" style={{ height: '28px', background: 'var(--panel-muted, #1e1e2e)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', flexShrink: 0, position: 'relative' }}>
              <span className="zone-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--zone-terminal-dot, #00ff88)', boxShadow: '0 0 6px var(--zone-terminal-dot, #00ff88)', flexShrink: 0 }} />
              <span className="zone-label" style={{ color: 'var(--zone-terminal-accent, #cdd6f4)', fontSize: '11px', fontWeight: 500 }}>Terminal</span>
              <span style={{ color: 'var(--muted, #6c7086)', fontSize: '10px', marginLeft: 'auto', fontFamily: '"JetBrains Mono", monospace' }}>{projectPath || '/'}</span>
              <button
                onClick={() => setTerminalMaximized(!terminalMaximized)}
                style={{ border: 'none', background: 'none', color: '#a6adc8', cursor: 'pointer', fontSize: '12px', padding: '0 4px', transition: 'color 0.15s' }}
                title={terminalMaximized ? 'Restore' : 'Maximize'}
                onMouseEnter={e => (e.currentTarget.style.color = '#cdd6f4')}
                onMouseLeave={e => (e.currentTarget.style.color = '#a6adc8')}
              >
                {terminalMaximized ? '⊡' : '⊞'}
              </button>
              <button
                onClick={onToggleTerminal}
                style={{ border: 'none', background: 'none', color: '#a6adc8', cursor: 'pointer', fontSize: '12px', padding: '0 4px', transition: 'color 0.15s' }}
                title="Close terminal"
                onMouseEnter={e => (e.currentTarget.style.color = '#f38ba8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#a6adc8')}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TerminalPanel cwd={projectPath || '/'} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
