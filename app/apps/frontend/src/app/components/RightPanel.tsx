import React from 'react';

export function RightPanel() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: '36px', borderBottom: '1px solid #e0e0e0', display: 'flex', alignItems: 'center', padding: '0 8px', gap: '4px' }}>
        <span style={{ color: '#888', fontSize: '13px' }}>Conversations</span>
        <button style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px' }}>+</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888' }}>Start a conversation</p>
      </div>
      <div style={{ borderTop: '1px solid #e0e0e0', padding: '8px' }}>
        <textarea
          placeholder="Type a message..."
          style={{ width: '100%', minHeight: '60px', resize: 'vertical', border: '1px solid #ddd', borderRadius: '4px', padding: '8px', fontSize: '13px', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  );
}
