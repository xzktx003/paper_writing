import React from 'react';

export function LeftPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '12px', fontWeight: 'bold', borderBottom: '1px solid #e0e0e0' }}>
        Project
      </div>
      <div style={{ flex: 1, padding: '8px', overflow: 'auto' }}>
        <p style={{ color: '#888' }}>No project open</p>
      </div>
      <div style={{ borderTop: '1px solid #e0e0e0', padding: '8px' }}>
        <p style={{ color: '#888', fontSize: '12px' }}>Skills</p>
      </div>
    </div>
  );
}
