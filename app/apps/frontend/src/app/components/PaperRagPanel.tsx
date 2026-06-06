import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addRagDocument, buildRagContext, getPaperAgentProjectId, indexRagCorpus,
  listRagDocuments, searchRagCorpus, searchExternalSources,
  deleteRagDocument, uploadRagDocument,
  RagDocument, RagSearchResult, ExternalSearchSource,
} from '../api/paperRagApi';

interface Props {
  projectPath?: string;
}

type RagTab = 'corpus' | 'search' | 'external' | 'upload';

export function PaperRagPanel({ projectPath }: Props) {
  const projectId = useMemo(() => getPaperAgentProjectId(projectPath), [projectPath]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Tab state ──────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<RagTab>('corpus');

  /* ── Corpus state ───────────────────────────────────────────── */
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  /* ── Search state ───────────────────────────────────────────── */
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RagSearchResult[]>([]);
  const [context, setContext] = useState('');

  /* ── Add text state ─────────────────────────────────────────── */
  const [filename, setFilename] = useState('note.md');
  const [content, setContent] = useState('');

  /* ── External search state ──────────────────────────────────── */
  const [extQuery, setExtQuery] = useState('');
  const [extResults, setExtResults] = useState<ExternalSearchSource[]>([]);
  const [extSources, setExtSources] = useState('semantic-scholar,arxiv');
  const [extLoading, setExtLoading] = useState(false);

  /* ── Upload state ────────────────────────────────────────────── */
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /* ── Corpus helpers ──────────────────────────────────────────── */

  const refreshDocuments = async () => {
    if (!projectId) return;
    const data = await listRagDocuments(projectId);
    setDocuments(data.documents || []);
  };

  useEffect(() => {
    refreshDocuments().catch(err => setStatus(`Failed to load documents: ${err.message}`));
  }, [projectId]);

  const runIndex = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await indexRagCorpus(projectId);
      setStatus(`Indexed ${data.documents} docs / ${data.chunks} chunks`);
      await refreshDocuments();
    } catch (err: any) {
      setStatus(`Index failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ── Corpus search ──────────────────────────────────────────── */

  const runSearch = async () => {
    if (!projectId || !query.trim()) return;
    setLoading(true);
    try {
      setActiveTab('search');
      const [searchData, contextData] = await Promise.all([
        searchRagCorpus(projectId, query, 5),
        buildRagContext(projectId, query, 5),
      ]);
      setResults(searchData.results || []);
      setContext(contextData.context || '');
      setStatus(`${searchData.results?.length || 0} evidence snippets found`);
    } catch (err: any) {
      setStatus(`Search failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ── Add text ───────────────────────────────────────────────── */

  const addDocument = async () => {
    if (!projectId || !filename.trim() || !content.trim()) return;
    setLoading(true);
    try {
      const data = await addRagDocument(projectId, { filename, content });
      setStatus(`Added ${data.document.path}`);
      setContent('');
      await refreshDocuments();
    } catch (err: any) {
      setStatus(`Add failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (docPath: string) => {
    if (!projectId) return;
    try {
      await deleteRagDocument(projectId, docPath);
      await refreshDocuments();
      setStatus(`Deleted ${docPath}`);
    } catch (err: any) {
      setStatus(`Delete failed: ${err.message}`);
    }
  };

  /* ── External search ────────────────────────────────────────── */

  const runExternalSearch = async () => {
    if (!extQuery.trim()) return;
    setExtLoading(true);
    try {
      const data = await searchExternalSources(projectId || '__global__', extQuery, {
        sources: extSources,
        limit: 10,
      });
      setExtResults(data.results || []);
    } catch (err: any) {
      setStatus(`External search failed: ${err.message}`);
    } finally {
      setExtLoading(false);
    }
  };

  /* ── File upload ─────────────────────────────────────────────── */

  const handleFileUpload = async (file: File) => {
    if (!projectId || !file) return;
    setUploading(true);
    setUploadStatus(`Uploading ${file.name}...`);
    try {
      const data = await uploadRagDocument(projectId, file);
      setUploadStatus(`Uploaded: ${data.document?.path || file.name}`);
      await refreshDocuments();
    } catch (err: any) {
      setUploadStatus(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleFileUpload(files[0]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFileUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  /* ── Render ──────────────────────────────────────────────────── */

  if (!projectId) {
    return <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>Paper RAG is available for managed paper projects.</div>;
  }

  const tabs: { key: RagTab; label: string }[] = [
    { key: 'corpus', label: '📚 Corpus' },
    { key: 'search', label: '🔍 Search' },
    { key: 'external', label: '🌐 External' },
    { key: 'upload', label: '📤 Upload' },
  ];

  return (
    <div style={{ padding: 10, fontSize: 12 }}>
      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '5px 2px', border: 'none', cursor: 'pointer',
              borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'none', color: activeTab === tab.key ? 'var(--accent-strong)' : 'var(--muted)',
              fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {status && (
        <div style={{ marginBottom: 8, color: 'var(--muted)', fontSize: 11, wordBreak: 'break-word' }}>
          {status}
        </div>
      )}

      {/* ── TAB: Corpus ─────────────────────────────────────────── */}
      {activeTab === 'corpus' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={runIndex} disabled={loading} style={btnStyle}>Index corpus</button>
            <button onClick={refreshDocuments} disabled={loading} style={btnStyle}>Refresh</button>
          </div>

          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 10, paddingBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Research corpus ({documents.length})</div>
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {documents.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>No indexed documents yet.</div>
              ) : documents.map(doc => (
                <div key={doc.path} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title || doc.path}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 10 }}>{doc.path} {doc.bytes ? `· ${(doc.bytes / 1024).toFixed(1)} KB` : ''}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.path)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: '#d32f2f', padding: '0 2px' }}
                    title="Delete document"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 10, paddingBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Add text source</div>
            <input value={filename} onChange={e => setFilename(e.target.value)} placeholder="filename.md" style={inputStyle} />
            <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Paste paper notes, abstracts, snippets, or extracted text..." style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
            <button onClick={addDocument} disabled={loading || !content.trim()} style={btnStyle}>Add to corpus</button>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Search corpus</div>
            <textarea value={query} onChange={e => setQuery(e.target.value)} placeholder="Ask a literature question or paste a claim..." style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} />
            <button onClick={runSearch} disabled={loading || !query.trim()} style={btnStyle}>Search</button>
          </div>
        </>
      )}

      {/* ── TAB: Search results ─────────────────────────────────── */}
      {activeTab === 'search' && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search query..." style={{ flex: 1, ...inputStyle, marginBottom: 0 }} />
            <button onClick={runSearch} disabled={loading || !query.trim()} style={btnStyle}>Go</button>
          </div>
          {results.length > 0 ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Evidence snippets ({results.length})</div>
              {results.map((item, index) => (
                <div key={item.id} style={{ marginBottom: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--paper)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>[{index + 1}] {item.source.path}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 4 }}>score {item.score} · lines {item.source.lineStart}-{item.source.lineEnd}</div>
                  <div>{item.text}</div>
                </div>
              ))}
              {context && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>RAG Context (for prompt injection)</div>
                  <textarea readOnly value={context} style={{ ...inputStyle, minHeight: 140, resize: 'vertical', fontFamily: 'monospace' }} />
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--muted)' }}>Run a search to see evidence snippets here.</div>
          )}
        </>
      )}

      {/* ── TAB: External search ────────────────────────────────── */}
      {activeTab === 'external' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Search external sources</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <input
                value={extSources}
                onChange={e => setExtSources(e.target.value)}
                style={{ flex: 1, ...inputStyle, marginBottom: 0, fontSize: 10 }}
                placeholder="sources: semantic-scholar,arxiv,crossref,openalex"
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
              Sources: semantic-scholar, arxiv, crossref, openalex
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={extQuery}
                onChange={e => setExtQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runExternalSearch(); }}
                placeholder="Search title, author, or topic..."
                style={{ flex: 1, ...inputStyle, marginBottom: 0 }}
              />
              <button onClick={runExternalSearch} disabled={extLoading || !extQuery.trim()} style={btnStyle}>
                {extLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {extResults.length > 0 && (
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Results ({extResults.length})</div>
              {extResults.map((paper, index) => (
                <div key={`${paper.source}-${index}`} style={{ marginBottom: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--paper)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{paper.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                    {paper.authors?.slice(0, 3).join(', ')}{paper.authors && paper.authors.length > 3 ? ' et al.' : ''}
                    {paper.year ? ` · ${paper.year}` : ''}
                    {paper.venue ? ` · ${paper.venue}` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                    {paper.source} · {paper.citation_count ? `${paper.citation_count} citations` : ''}
                    {paper.doi ? ` · DOI: ${paper.doi}` : ''}
                  </div>
                  {paper.abstract && (
                    <div style={{ fontSize: 11, marginTop: 4, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {paper.abstract.slice(0, 300)}{paper.abstract.length > 300 ? '...' : ''}
                    </div>
                  )}
                  {paper.url && (
                    <div style={{ marginTop: 4 }}>
                      <a href={paper.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)' }}>
                        Open ↗
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TAB: Upload ─────────────────────────────────────────── */}
      {activeTab === 'upload' && (
        <>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            style={{
              border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8, padding: 30, textAlign: 'center',
              background: dragOver ? 'var(--accent-bg)' : 'var(--paper)',
              transition: 'all 0.15s', cursor: 'pointer', marginBottom: 10,
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              {dragOver ? 'Drop file here' : 'Drag & drop or click to upload'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              Supported: .md, .txt, .tex, .bib, .pdf, .docx, .csv, .json, .html
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,.txt,.tex,.bib,.pdf,.docx,.csv,.json,.html,.xml,.yaml,.yml"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {uploadStatus && (
            <div style={{ fontSize: 11, color: uploadStatus.startsWith('Uploaded') ? '#2e7d32' : '#d32f2f', marginBottom: 6 }}>
              {uploadStatus}
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Current corpus ({documents.length})</div>
              {documents.map(doc => (
                <div key={doc.path} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title || doc.path}</div>
                  </div>
                  <button onClick={() => handleDeleteDocument(doc.path)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: '#d32f2f', padding: '0 2px' }}>×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btnStyle: React.CSSProperties = { padding: '4px 8px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--paper)', color: 'var(--text)', cursor: 'pointer' };
const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', marginBottom: 6, padding: '5px 7px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--paper)', color: 'var(--text)' };