import React from 'react';
import { ProjectTree } from './ProjectTree';
import { ProjectConfig } from '../hooks/useProject';

interface Props {
  projectPath: string | null;
  config: ProjectConfig | null;
  onFileSelect: (file: { path: string; type: 'chapter' | 'code' | 'other' }) => void;
  onChapterReorder: (newOrder: string[]) => void;
}

export function LeftPanel({ projectPath, config, onFileSelect, onChapterReorder }: Props) {

  if (!projectPath || !config) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)' }}>
        <div style={{ padding: '12px 14px', fontWeight: 600, fontSize: '13px', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
          Project
        </div>
        <div style={{ flex: 1, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <div style={{ fontSize: '28px', opacity: 0.3 }}>📂</div>
          <p style={{ color: 'var(--muted)', fontSize: '13px', margin: 0 }}>No project open</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--panel)' }}>
      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <div style={{ padding: '4px 0' }}>
          <ProjectTree
            projectPath={projectPath}
            config={config}
            onFileSelect={onFileSelect}
            onChapterReorder={onChapterReorder}
          />
        </div>
      </div>
    </div>
  );
}
