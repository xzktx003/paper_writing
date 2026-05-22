import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';
import { TerminalPanel } from './TerminalPanel';
import { useTheme, ThemeToggle, ThemeName, THEMES } from './ThemeToggle';

export function Layout() {
  const app = useApp();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(380);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(220);
  const [terminalMaximized, setTerminalMaximized] = useState(false);

  const currentChapterSkills = (() => {
    if (app.activeFileIndex < 0) return [];
    const file = app.openFiles[app.activeFileIndex];
    if (!file || file.type !== 'chapter' || !app.project.config) return [];
    const ch = app.project.config.chapters?.find(c => c.file === file.filename);
    return ch?.skills || [];
  })();

  const handleTerminalResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = terminalHeight;
    const onMove = (ev: MouseEvent) => {
      const newH = Math.max(100, Math.min(600, startH + (startY - ev.clientY)));
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Main panels row */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Panel */}
        {leftCollapsed ? (
          <div style={{ width: '36px', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px', background: 'var(--panel-muted)', gap: '8px' }}>
            <button
              onClick={() => setLeftCollapsed(false)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', padding: '4px', borderRadius: '4px', transition: 'color 0.15s' }}
              title="Expand file tree"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
            >
              ▶
            </button>
          </div>
        ) : (
          <div className="zone-files" style={{ width: leftWidth, minWidth: 200, borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
            <div className="zone-header" style={{ height: '38px', display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, gap: '6px', position: 'relative' }}>
              <span className="zone-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              <button
                onClick={() => navigate('/projects')}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', padding: '3px 6px', borderRadius: '6px', transition: 'all 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
              >
                ← Back
              </button>
              <ThemeToggle theme={theme} onThemeChange={setTheme} />
              <button
                onClick={() => setLeftCollapsed(true)}
                style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', padding: '3px 5px', borderRadius: '4px', transition: 'color 0.15s' }}
                title="Collapse"
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                ◀
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <LeftPanel
                projectPath={app.project.path}
                config={app.project.config}
                onFileSelect={app.openFile}
                onChapterReorder={() => {}}
              />
            </div>
          </div>
        )}

        {!leftCollapsed && <ResizeHandle onResize={(delta) => setLeftWidth(w => Math.max(200, w + delta))} />}

        {/* Center Panel */}
        <div className="zone-editor" style={{ flex: 1, overflow: 'hidden', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
          <CenterPanel
            openFiles={app.openFiles}
            activeFileIndex={app.activeFileIndex}
            onFileChange={app.updateFileContent}
            onTabSelect={app.setActiveFileIndex}
            onTabClose={app.closeFile}
            terminalVisible={app.terminalVisible}
            onToggleTerminal={app.toggleTerminal}
            projectPath={app.project.path || undefined}
          />
        </div>

        {!rightCollapsed && <ResizeHandle onResize={(delta) => setRightWidth(w => Math.max(300, w - delta))} />}

        {/* Right Panel */}
        {rightCollapsed ? (
          <div style={{ width: '36px', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: '10px', background: 'var(--panel-muted)', gap: '8px' }}>
            <button
              onClick={() => setRightCollapsed(false)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--muted)', padding: '4px', borderRadius: '4px', transition: 'color 0.15s' }}
              title="Expand conversations"
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
            >
              ◀
            </button>
          </div>
        ) : (
          <div className="zone-ai" style={{ width: rightWidth, minWidth: 300, borderLeft: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
            <div className="zone-header" style={{ height: '38px', display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, position: 'relative' }}>
              <span className="zone-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginRight: 8 }} />
              <span className="zone-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.02em' }}>AI Assistant</span>
              <button
                onClick={() => setRightCollapsed(true)}
                style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--muted)', padding: '3px 5px', borderRadius: '4px', transition: 'color 0.15s' }}
                title="Collapse"
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                ▶
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <RightPanel
                conversations={app.conversations}
                activeConv={app.activeConv}
                loading={app.convLoading}
                chapters={app.project.config?.chapters || []}
                skills={app.skills}
                onSelect={app.selectConversation}
                onClose={app.removeConversation}
                onCreate={app.createConversation}
                onSend={app.sendMessage}
                onRename={app.renameConversation}
                globalSkills={app.project.config?.global_skills || []}
                chapterSkills={currentChapterSkills}
                onActivateSkill={app.activateSkill}
              />
            </div>
          </div>
        )}
      </div>

      {/* Global Terminal Panel (bottom) */}
      {app.terminalVisible && (
        <>
          <div
            onMouseDown={handleTerminalResize}
            style={{ height: '5px', cursor: 'row-resize', background: 'var(--border)', flexShrink: 0, position: 'relative', transition: 'background 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
          >
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '30px', height: '3px', borderRadius: '2px', background: 'var(--muted)', opacity: 0.4 }} />
          </div>
          <div style={{ height: terminalMaximized ? '100%' : terminalHeight, flex: terminalMaximized ? 1 : undefined, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
            <div style={{ height: '28px', background: 'var(--panel-muted)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', flexShrink: 0 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text)' }}>Terminal</span>
              <span style={{ color: 'var(--muted)', fontSize: '10px', marginLeft: 'auto', fontFamily: 'monospace' }}>{app.project.path || '/'}</span>
              <button
                onClick={() => setTerminalMaximized(!terminalMaximized)}
                style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: '0 4px', transition: 'color 0.15s' }}
                title={terminalMaximized ? 'Restore' : 'Maximize'}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                {terminalMaximized ? '⊡' : '⊞'}
              </button>
              <button
                onClick={app.toggleTerminal}
                style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '12px', padding: '0 4px', transition: 'color 0.15s' }}
                title="Close terminal"
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger, #ef4444)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TerminalPanel cwd={app.project.path || '/'} />
            </div>
          </div>
        </>
      )}

      {/* Status Bar */}
      <StatusBar
        activeFile={app.openFiles[app.activeFileIndex] || null}
        theme={theme}
        onThemeChange={setTheme}
      />
    </div>
  );
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [active, setActive] = useState(false);
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setActive(true);
    let lastX = e.clientX;
    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - lastX;
      lastX = ev.clientX;
      onResize(delta);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setActive(false);
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ width: '5px', cursor: 'col-resize', background: 'transparent', position: 'relative', flexShrink: 0, transition: 'background 0.15s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-soft)')}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '3px', height: '30px', borderRadius: '2px', background: active ? 'var(--accent)' : 'var(--border)', transition: 'background 0.15s' }} />
    </div>
  );
}

function StatusBar({ activeFile, theme, onThemeChange }: { activeFile: { filename: string; content: string; type: string; dirty: boolean } | null; theme: ThemeName; onThemeChange: (t: ThemeName) => void }) {
  const wordCount = activeFile ? activeFile.content.split(/\s+/).filter(Boolean).length : 0;
  const lineCount = activeFile ? activeFile.content.split('\n').length : 0;
  const charCount = activeFile ? activeFile.content.length : 0;

  const fileType = activeFile
    ? activeFile.filename.endsWith('.tex') ? 'LaTeX'
    : activeFile.filename.endsWith('.md') ? 'Markdown'
    : activeFile.filename.endsWith('.bib') ? 'BibTeX'
    : activeFile.filename.endsWith('.json') ? 'JSON'
    : activeFile.filename.endsWith('.yaml') || activeFile.filename.endsWith('.yml') ? 'YAML'
    : 'Text'
    : '';

  return (
    <div style={{
      height: '24px',
      borderTop: '1px solid var(--border)',
      background: 'var(--panel-muted)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 12px',
      gap: '16px',
      fontSize: '11px',
      color: 'var(--muted)',
      flexShrink: 0,
    }}>
      {activeFile && (
        <>
          <span>{fileType}</span>
          <span>Lines: {lineCount}</span>
          <span>Words: {wordCount}</span>
          <span>Chars: {charCount}</span>
          {activeFile.dirty && <span style={{ color: 'var(--accent-strong)' }}>Modified</span>}
        </>
      )}
      <span style={{ marginLeft: 'auto', cursor: 'pointer' }} onClick={() => {
        const idx = THEMES.findIndex(t => t.value === theme);
        onThemeChange(THEMES[(idx + 1) % THEMES.length].value);
      }}>
        {THEMES.find(t => t.value === theme)?.label || theme}
      </span>
    </div>
  );
}
