import React, { useState, useCallback } from 'react';
import { gsap } from "../gsap";
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';
import { TerminalPanel } from './TerminalPanel';
import { useTheme, ThemeToggle, ThemeName, THEMES } from './ThemeToggle';
import styles from './Layout.module.css';

const LEFT_PANEL_DEFAULT_WIDTH = 260;
const RIGHT_PANEL_DEFAULT_WIDTH = 380;
const LEFT_PANEL_MIN_WIDTH = 120;
const RIGHT_PANEL_MIN_WIDTH = 180;
const CENTER_PANEL_MIN_WIDTH = 360;
const RESIZE_HANDLE_WIDTH = 5;

function clampPanelWidth(width: number, minWidth: number, maxWidth: number) {
  return Math.max(minWidth, Math.min(Math.max(minWidth, maxWidth), width));
}

export function Layout() {
  const app = useApp();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [leftWidth, setLeftWidth] = useState(LEFT_PANEL_DEFAULT_WIDTH);
  const [rightWidth, setRightWidth] = useState(RIGHT_PANEL_DEFAULT_WIDTH);
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


  // ── GSAP Layout Entrance Animation ──
  React.useEffect(() => {
    const ctx = gsap.context(() => {
      // Panels slide in from sides
      gsap.from(".zone-files", { x: -60, opacity: 0, duration: 0.7, ease: "power3.out", delay: 0.1 });
      gsap.from(".zone-editor", { y: 20, opacity: 0, duration: 0.6, ease: "power3.out", delay: 0.2 });
      gsap.from(".zone-ai, .zone-terminal", { x: 60, opacity: 0, duration: 0.7, ease: "power3.out", delay: 0.3 });
    });
    return () => ctx.revert();
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Left Panel */}
        {leftCollapsed ? (
          <div className={styles.collapsedPanel}>
            <button className={styles.collapseBtn} onClick={() => setLeftCollapsed(false)} title="Expand file tree">▶</button>
          </div>
        ) : (
          <div className="zone-files" style={{ width: leftWidth, minWidth: LEFT_PANEL_MIN_WIDTH, borderRight: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
            <div className="zone-header" style={{ height: '38px', display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, gap: '6px', position: 'relative' }}>
              <span className="zone-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
              <button className={styles.backBtn} onClick={() => navigate('/projects')}>← Back</button>
              <ThemeToggle theme={theme} onThemeChange={setTheme} />
              <button className={styles.collapseBtnSmall} onClick={() => setLeftCollapsed(true)} title="Collapse">◀</button>
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

        {!leftCollapsed && (
          <ResizeHandle
            side="left"
            leftWidth={leftWidth}
            rightWidth={rightCollapsed ? 0 : rightWidth}
            onResize={(width, maxWidth) => setLeftWidth(clampPanelWidth(width, LEFT_PANEL_MIN_WIDTH, maxWidth))}
          />
        )}

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
            editorMode={app.project.config?.editor_mode}
            chaptersCount={app.project.config?.chapters?.length || 0}
            pendingEdits={app.pendingEdits}
            onAcceptEdit={app.acceptEdit}
            onRejectEdit={app.rejectEdit}
          />
        </div>

        {!rightCollapsed && (
          <ResizeHandle
            side="right"
            leftWidth={leftCollapsed ? 0 : leftWidth}
            rightWidth={rightWidth}
            onResize={(width, maxWidth) => setRightWidth(clampPanelWidth(width, RIGHT_PANEL_MIN_WIDTH, maxWidth))}
          />
        )}

        {/* Right Panel */}
        {rightCollapsed ? (
          <div className={styles.collapsedPanelRight}>
            <button className={styles.collapseBtn} onClick={() => setRightCollapsed(false)} title="Expand conversations">◀</button>
          </div>
        ) : (
          <div className="zone-ai" style={{ width: rightWidth, minWidth: RIGHT_PANEL_MIN_WIDTH, borderLeft: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--panel)' }}>
            <div className="zone-header" style={{ height: '38px', display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, position: 'relative' }}>
              <span className="zone-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginRight: 8 }} />
              <span className="zone-label" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', letterSpacing: '0.02em' }}>AI Assistant</span>
              <button className={styles.collapseBtnSmall} onClick={() => setRightCollapsed(true)} title="Collapse">▶</button>
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
                projectPath={app.project.path || undefined}
                activeFile={app.openFiles[app.activeFileIndex]?.filename}
                pendingEdits={app.pendingEdits}
                onAcceptEdit={app.acceptEdit}
                onRejectEdit={app.rejectEdit}
              />
            </div>
          </div>
        )}
      </div>

      {/* Global Terminal Panel (bottom) */}
      {app.terminalVisible && (
        <>
          <div className={styles.terminalResize} onMouseDown={handleTerminalResize}>
            <div className={styles.terminalResizeGrip} />
          </div>
          <div style={{ height: terminalMaximized ? '100%' : terminalHeight, flex: terminalMaximized ? 1 : undefined, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border)' }}>
            <div style={{ height: '28px', background: 'var(--panel-muted)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: '8px', flexShrink: 0 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#00ff88', boxShadow: '0 0 6px #00ff88', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text)' }}>Terminal</span>
              <span style={{ color: 'var(--muted)', fontSize: '10px', marginLeft: 'auto', fontFamily: 'monospace' }}>{app.project.path || '/'}</span>
              <button className={styles.terminalBtn} onClick={() => setTerminalMaximized(!terminalMaximized)} title={terminalMaximized ? 'Restore' : 'Maximize'}>
                {terminalMaximized ? '⊡' : '⊞'}
              </button>
              <button className={styles.terminalCloseBtn} onClick={app.toggleTerminal} title="Close terminal">×</button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <TerminalPanel cwd={app.project.path || '/'} />
            </div>
          </div>
        </>
      )}

      {/* Floating Terminal Toggle Button (bottom-right) */}
      {!app.terminalVisible && (
        <button
          onClick={app.toggleTerminal}
          title="Open Terminal"
          style={{
            position: 'fixed',
            bottom: 36,
            right: 16,
            width: 36,
            height: 36,
            borderRadius: '50%',
            border: '1px solid var(--border)',
            background: 'var(--panel)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 100,
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.color = 'var(--accent-strong)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--panel)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
        >
          {'>_'}
        </button>
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

function ResizeHandle({ side, leftWidth, rightWidth, onResize }: { side: 'left' | 'right'; leftWidth: number; rightWidth: number; onResize: (width: number, maxWidth: number) => void }) {
  const [active, setActive] = useState(false);
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setActive(true);
    const startX = e.clientX;
    const startWidth = side === 'left' ? leftWidth : rightWidth;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const otherSideWidth = side === 'left' ? rightWidth : leftWidth;
    const statusBarBuffer = 24;
    const visibleHandleCount = (leftWidth > 0 ? 1 : 0) + (rightWidth > 0 ? 1 : 0);
    const maxWidth = viewportWidth - otherSideWidth - CENTER_PANEL_MIN_WIDTH - statusBarBuffer - visibleHandleCount * RESIZE_HANDLE_WIDTH;
    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      const nextWidth = side === 'left' ? startWidth + delta : startWidth - delta;
      onResize(nextWidth, maxWidth);
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
      className={`${styles.resizeHandle} ${active ? styles.resizeHandleActive : ''}`}
    >
      <div className={styles.resizeIndicator} />
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
