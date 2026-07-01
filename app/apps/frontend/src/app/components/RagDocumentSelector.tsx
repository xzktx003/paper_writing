import React, { useEffect, useState } from 'react';
import { listRagDocuments, RagDocument, getPaperAgentProjectId } from '../api/paperRagApi';

interface Props {
  projectPath?: string;
  selectedDocs: string[];
  onChange: (docPaths: string[]) => void;
}

export function RagDocumentSelector({ projectPath, selectedDocs, onChange }: Props) {
  const projectId = getPaperAgentProjectId(projectPath);
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    loadDocuments();
  }, [projectId]);

  const loadDocuments = async () => {
    if (!projectId) return;
    try {
      const data = await listRagDocuments(projectId);
      setDocuments(data.documents || []);
    } catch (e) {
      console.error('Failed to load RAG documents:', e);
    }
  };

  const toggleDoc = (path: string) => {
    if (selectedDocs.includes(path)) {
      onChange(selectedDocs.filter(p => p !== path));
    } else {
      onChange([...selectedDocs, path]);
    }
  };

  const selectAll = () => {
    onChange(documents.map(d => d.path));
  };

  const clearAll = () => {
    onChange([]);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileName = (path: string) => {
    return path.split('/').pop() || path;
  };

  if (!projectId) return null;

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 10px',
          borderRadius: '999px',
          border: selectedDocs.length > 0 ? '1px solid var(--accent)' : '1px solid var(--border)',
          background: selectedDocs.length > 0 ? 'var(--accent-soft)' : 'var(--bg-secondary)',
          color: selectedDocs.length > 0 ? 'var(--accent-strong)' : 'var(--muted)',
          fontSize: '10px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        title="Select documents to use as context"
      >
        📚 {selectedDocs.length > 0 ? `${selectedDocs.length} docs` : 'Reference Docs'}
        <span style={{ fontSize: '8px' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '8px',
            width: '340px',
            maxHeight: '400px',
            overflow: 'auto',
            background: 'var(--paper)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 1000,
          }}
        >
          <div style={{
            padding: '10px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--panel-muted)',
            position: 'sticky',
            top: 0,
          }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text)' }}>
              📚 RAG Documents ({documents.length})
            </span>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={selectAll}
                style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--muted)',
                  fontSize: '9px',
                  cursor: 'pointer',
                }}
              >
                Select All
              </button>
              <button
                onClick={clearAll}
                style={{
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--muted)',
                  fontSize: '9px',
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>
          </div>

          {documents.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
              No documents uploaded<br />
              <span style={{ fontSize: '10px' }}>Upload PDF/TXT files in RAG panel</span>
            </div>
          ) : (
            <div style={{ padding: '6px' }}>
              {documents.map((doc) => {
                const isSelected = selectedDocs.includes(doc.path);
                const fileName = getFileName(doc.path);
                const isChinese = /[\u4e00-\u9fa5]/.test(fileName);
                return (
                  <label
                    key={doc.path}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '8px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: isSelected ? 'var(--accent-soft)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--hover)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDoc(doc.path)}
                      style={{
                        marginTop: '2px',
                        accentColor: 'var(--accent)',
                        width: '14px',
                        height: '14px',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: isSelected ? 'var(--accent-strong)' : 'var(--text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        direction: 'rtl',
                        textAlign: 'left',
                      }} title={fileName}>
                        {fileName}
                      </div>
                      {doc.bytes && (
                        <div style={{ fontSize: '9px', color: 'var(--muted)', marginTop: '2px' }}>
                          {formatFileSize(doc.bytes)}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
