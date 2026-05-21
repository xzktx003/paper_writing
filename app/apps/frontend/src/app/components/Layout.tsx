import React, { useState } from 'react';
import { LeftPanel } from './LeftPanel';
import { CenterPanel } from './CenterPanel';
import { RightPanel } from './RightPanel';

export function Layout() {
  const [leftWidth, setLeftWidth] = useState(250);
  const [rightWidth, setRightWidth] = useState(380);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <div style={{ width: leftWidth, minWidth: 200, borderRight: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <LeftPanel />
      </div>
      <ResizeHandle onResize={(delta: number) => setLeftWidth(w => Math.max(200, w + delta))} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <CenterPanel />
      </div>
      <ResizeHandle onResize={(delta: number) => setRightWidth(w => Math.max(300, w - delta))} />
      <div style={{ width: rightWidth, minWidth: 300, borderLeft: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <RightPanel />
      </div>
    </div>
  );
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const handleMouseDown = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const handleMouseMove = (ev: MouseEvent) => {
      onResize(ev.clientX - startX);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{ width: 4, cursor: 'col-resize', background: 'transparent' }}
    />
  );
}
