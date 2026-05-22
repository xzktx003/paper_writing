import React, { useRef, useState } from 'react';
import { ProjectTree } from './ProjectTree';
import { SkillPanel } from './SkillPanel';
import { ProjectConfig } from '../hooks/useProject';

interface Props {
  projectPath: string | null;
  config: ProjectConfig | null;
  onFileSelect: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => void;
  onChapterReorder: (newOrder: string[]) => void;
  globalSkills?: string[];
  chapterSkills?: string[];
  onActivateSkill?: (skillName: string) => void;
}

export function LeftPanel({ projectPath, config, onFileSelect, onChapterReorder, globalSkills = [], chapterSkills = [], onActivateSkill = () => {} }: Props) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [skillsHeight, setSkillsHeight] = useState(240);

  if (!projectPath || !config) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)' }}>
        <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: '13px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
          Project
        </div>
        <div style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ fontSize: '28px', opacity: 0.3 }}>📂</div>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>No project open</p>
          <button style={{ padding: '7px 16px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', background: 'var(--paper)', color: 'var(--text)', fontSize: '12px', fontWeight: 500, transition: 'all 0.15s' }}>Open Project</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)' }}>
      <div style={{ padding: '10px 14px', fontWeight: 600, borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--text)', background: 'var(--panel-muted)' }}>
        {config.title || 'Untitled'}
      </div>
      <div ref={contentRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 120, overflow: 'auto', padding: '4px 0' }}>
          <ProjectTree
            projectPath={projectPath}
            config={config}
            onFileSelect={onFileSelect}
            onChapterReorder={onChapterReorder}
          />
        </div>
        <HorizontalResizeHandle
          contentRef={contentRef}
          onResize={(nextHeight) => setSkillsHeight(nextHeight)}
        />
        <div style={{ height: skillsHeight, minHeight: 96, overflow: 'auto', background: 'var(--panel-muted)', flexShrink: 0 }}>
          <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Skills</div>
          <SkillPanel
            globalSkills={globalSkills}
            chapterSkills={chapterSkills}
            onActivateSkill={onActivateSkill}
          />
        </div>
      </div>
    </div>
  );
}

function HorizontalResizeHandle({
  contentRef,
  onResize,
}: {
  contentRef: React.RefObject<HTMLDivElement>;
  onResize: (nextHeight: number) => void;
}) {
  const [active, setActive] = useState(false);

  const handleMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    const content = contentRef.current;
    if (!content) return;
    setActive(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rect = content.getBoundingClientRect();
      const nextHeight = clamp(rect.bottom - moveEvent.clientY, 96, Math.max(96, rect.height - 120));
      onResize(nextHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setActive(false);
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      title="Resize files and skills panels"
      onMouseDown={handleMouseDown}
      style={{
        height: 7,
        cursor: 'row-resize',
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: active ? 'var(--accent-soft)' : 'var(--panel)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'var(--panel)'; }}
    >
      <div style={{ width: 28, height: 2, borderRadius: 999, background: active ? 'var(--accent)' : 'var(--border)' }} />
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
