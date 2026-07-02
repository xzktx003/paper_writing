import React, { useState } from 'react';
import { diffLines, Change } from 'diff';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

function buildDiffLines(original: string, proposed: string): DiffLine[] {
  const changes = diffLines(original, proposed);
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const parts = (change.value || '').split('\n');
    // Remove trailing empty from split
    if (parts[parts.length - 1] === '') parts.pop();

    for (const part of parts) {
      if (change.removed) {
        lines.push({ type: 'removed', content: part, oldLineNum: oldLine++, newLineNum: null });
      } else if (change.added) {
        lines.push({ type: 'added', content: part, oldLineNum: null, newLineNum: newLine++ });
      } else {
        lines.push({ type: 'unchanged', content: part, oldLineNum: oldLine++, newLineNum: newLine++ });
      }
    }
  }
  return lines;
}

interface Props {
  original: string;
  proposed: string;
  filename?: string;
  stats?: { added: number; removed: number };
  onAccept?: (newContent: string) => void;
  onReject?: () => void;
  compact?: boolean;
  error?: string;
}

export function InlineDiffViewer({ original, proposed, filename, stats, onAccept, onReject, compact, error }: Props) {
  const [expanded, setExpanded] = useState(!compact);
  const lines = buildDiffLines(original, proposed);

  if (!expanded) {
    return (
      <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer' }} onClick={() => setExpanded(true)}>
        <span style={{ color: 'var(--muted)' }}>📝 </span>
        {filename && <span style={{ fontWeight: 600 }}>{filename}: </span>}
        <span style={{ color: '#22c55e' }}>+{stats?.added || 0}</span>
        <span style={{ color: '#ef4444', marginLeft: 4 }}>-{stats?.removed || 0}</span>
        <span style={{ color: 'var(--muted)', marginLeft: 8 }}>Click to expand diff</span>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden', fontSize: '12px', fontFamily: 'monospace' }}>
      {/* Header */}
      <div style={{ padding: '6px 12px', background: 'var(--panel-muted)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {filename && <span style={{ fontWeight: 600 }}>{filename}</span>}
          <span style={{ color: '#22c55e', fontWeight: 600 }}>+{stats?.added || 0}</span>
          <span style={{ color: '#ef4444', fontWeight: 600 }}>-{stats?.removed || 0}</span>
          {compact && <button onClick={(e) => { e.stopPropagation(); setExpanded(false); }} style={{ border: 'none', background: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 11 }}>Collapse</button>}
        </div>
        {onAccept && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onAccept(proposed)} style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>✓ Accept</button>
            {onReject && <button onClick={onReject} style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text)', fontSize: 11, cursor: 'pointer' }}>✗ Reject</button>}
          </div>
        )}
      </div>
      {error && (
        <div style={{ padding: '7px 12px', background: 'rgba(239,68,68,0.1)', borderBottom: '1px solid rgba(239,68,68,0.3)', color: '#dc2626', fontFamily: 'sans-serif', fontSize: 11 }}>
          {error}
        </div>
      )}
      {/* Diff lines */}
      <div style={{ maxHeight: compact ? 300 : 500, overflow: 'auto', background: 'var(--paper)' }}>
        {lines.map((line, i) => (
          <div key={i} style={{
            display: 'flex', padding: '1px 0', background: line.type === 'added' ? 'rgba(34,197,94,0.1)' : line.type === 'removed' ? 'rgba(239,68,68,0.1)' : 'transparent',
          }}>
            <span style={{ width: 36, textAlign: 'right', padding: '0 4px', color: 'var(--muted)', opacity: 0.5, userSelect: 'none', flexShrink: 0 }}>{line.oldLineNum || ''}</span>
            <span style={{ width: 36, textAlign: 'right', padding: '0 4px', color: 'var(--muted)', opacity: 0.5, userSelect: 'none', flexShrink: 0 }}>{line.newLineNum || ''}</span>
            <span style={{ width: 18, textAlign: 'center', color: line.type === 'added' ? '#22c55e' : line.type === 'removed' ? '#ef4444' : 'var(--muted)', userSelect: 'none', flexShrink: 0 }}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            <span style={{ flex: 1, whiteSpace: 'pre-wrap', color: line.type === 'removed' ? '#ef4444' : 'var(--text)' }}>{line.content || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
