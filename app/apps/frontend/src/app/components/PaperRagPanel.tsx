import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addRagDocument, buildRagContext, getPaperAgentProjectId,
  getRagHealth, indexRagCorpus, listRagDocuments, searchRagCorpus, searchExternalSources,
  deleteRagDocument, uploadRagDocument,
  RagDocument, RagIndexHealth, RagSearchResult, ExternalSearchSource, ExternalSearchSourceStatus,
} from '../api/paperRagApi';

interface Props {
  projectPath?: string;
}

type RagTab = 'corpus' | 'search' | 'external' | 'upload';

export function PaperRagPanel({ projectPath }: Props) {
  const { t } = useTranslation();
  const projectId = useMemo(() => getPaperAgentProjectId(projectPath), [projectPath]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Tab state ──────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<RagTab>('corpus');

  /* ── Corpus state ───────────────────────────────────────────── */
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [health, setHealth] = useState<RagIndexHealth | null>(null);
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
  const [extSourceStatuses, setExtSourceStatuses] = useState<ExternalSearchSourceStatus[]>([]);
  const [extSources, setExtSources] = useState('semantic-scholar,arxiv');
  const [extLoading, setExtLoading] = useState(false);

  /* ── Upload state ────────────────────────────────────────────── */
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadStatusKind, setUploadStatusKind] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /* ── Corpus helpers ──────────────────────────────────────────── */

  const refreshDocuments = async () => {
    if (!projectId) return;
    const healthData = await getRagHealth(projectId);
    setHealth(healthData);
    if (healthData.issues.some(issue => issue.code === 'index-missing' || issue.code === 'index-corrupt')) {
      setDocuments([]);
      return;
    }
    const documentData = await listRagDocuments(projectId);
    setDocuments(documentData.documents || []);
  };

  const rebuildIndex = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const result = await indexRagCorpus(projectId);
      await refreshDocuments();
      setStatus(t('RAG index repaired. New generation: {{generation}}', { generation: result.generation }));
    } catch (err: any) {
      setStatus(t('RAG index repair failed: {{error}}', { error: err.message }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshDocuments().catch(err => setStatus(t('Failed to load documents: {{error}}', { error: err.message })));
  }, [projectId, t]);

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
      setStatus(t('{{count}} evidence snippets found', { count: searchData.results?.length || 0 }));
    } catch (err: any) {
      setStatus(t('Search failed: {{error}}', { error: err.message }));
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
      setStatus(t('Added and indexed {{path}}', { path: data.document.path }));
      setContent('');
      await refreshDocuments();
    } catch (err: any) {
      setStatus(t('Add failed: {{error}}', { error: err.message }));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDocument = async (docPath: string) => {
    if (!projectId) return;
    try {
      await deleteRagDocument(projectId, docPath);
      await refreshDocuments();
      setStatus(t('Deleted {{path}}', { path: docPath }));
    } catch (err: any) {
      setStatus(t('Delete failed: {{error}}', { error: err.message }));
    }
  };

  /* ── External search ────────────────────────────────────────── */

  const runExternalSearch = async () => {
    if (!extQuery.trim()) return;
    setExtLoading(true);
    setExtSourceStatuses([]);
    try {
      const data = await searchExternalSources(projectId || '__global__', extQuery, {
        sources: extSources,
        limit: 10,
      });
      setExtResults(data.results || []);
      setExtSourceStatuses(data.sources || []);
    } catch (err: any) {
      setStatus(t('External search failed: {{error}}', { error: err.message }));
    } finally {
      setExtLoading(false);
    }
  };

  /* ── File upload ─────────────────────────────────────────────── */

  const handleFileUpload = async (file: File) => {
    if (!projectId || !file) return;
    setUploading(true);
    setUploadStatusKind('idle');
    setUploadStatus(t('Uploading {{file}}...', { file: file.name }));
    try {
      const data = await uploadRagDocument(projectId, file);
      setUploadStatusKind('success');
      setUploadStatus(t('Uploaded and indexed: {{path}}', { path: data.document?.path || file.name }));
      await refreshDocuments();
    } catch (err: any) {
      setUploadStatusKind('error');
      setUploadStatus(t('Upload failed: {{error}}', { error: err.message }));
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
    return <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>{t('Paper RAG is available for managed paper projects.')}</div>;
  }

  const tabs: { key: RagTab; label: string }[] = [
    { key: 'corpus', label: `📚 ${t('Corpus')}` },
    { key: 'search', label: `🔍 ${t('Search')}` },
    { key: 'external', label: `🌐 ${t('External')}` },
    { key: 'upload', label: `📤 ${t('Upload')}` },
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
            <button onClick={refreshDocuments} disabled={loading} style={btnStyle}>{t('Refresh')}</button>
            <button data-testid="rag-rebuild-index" onClick={rebuildIndex} disabled={loading} style={btnStyle}>{t('Repair / rebuild index')}</button>
          </div>

          <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 8 }}>
            {t('Documents are indexed automatically when they are added, uploaded, or deleted.')}
          </div>

          <div data-testid="rag-health-card" style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 10, background: 'var(--paper)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 5 }}>
              <strong>{t('RAG index health')}</strong>
              <span
                data-testid="rag-health-status"
                style={{
                  borderRadius: 999,
                  padding: '1px 7px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: health?.status === 'healthy' ? '#1b5e20' : health?.status === 'corrupt' ? '#b71c1c' : '#8a5600',
                  background: health?.status === 'healthy' ? '#e8f5e9' : health?.status === 'corrupt' ? '#ffebee' : '#fff8e1',
                }}
              >
                {health?.status ? t(health.status) : t('Loading...')}
              </span>
            </div>
            <div style={{ fontWeight: 600 }}>{t('Local keyword evidence retrieval')}</div>
            <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 2 }}>
              {t('Transparent token-overlap search; not semantic vector retrieval.')}
            </div>
            {health && (
              <>
                <div data-testid="rag-health-counts" style={{ marginTop: 6 }}>
                  {t('Files')}: {health.counts.files} · {t('Indexed')}: {health.counts.indexedFiles} · {t('Failed')}: {health.counts.failedFiles} · {t('Zero chunks')}: {health.counts.zeroChunkFiles} · {t('Chunks')}: {health.counts.chunks}
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 10, marginTop: 3, wordBreak: 'break-all' }}>
                  {t('Last successful index')}: {health.indexedAt || t('Never')}<br />
                  {t('Generation')}: {health.generation || '—'}<br />
                  {t('Fingerprint')}: {health.fingerprint || '—'}
                </div>
                {health.issues.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: health.status === 'corrupt' ? '#b71c1c' : 'var(--muted)' }}>
                    {health.issues.map(issue => <li key={issue.code}>{t(issue.code, { defaultValue: issue.message })}</li>)}
                  </ul>
                )}
                {health.documents.length > 0 && (
                  <details data-testid="rag-file-diagnostics" style={{ marginTop: 6 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('Per-file diagnostics')}</summary>
                    <div style={{ maxHeight: 180, overflow: 'auto', marginTop: 4 }}>
                      {health.documents.map(document => (
                        <div key={document.path} style={{ padding: '4px 0', borderTop: '1px solid var(--border)' }}>
                          <div style={{ fontWeight: 600, wordBreak: 'break-all' }}>{document.path}</div>
                          <div style={{ color: 'var(--muted)', fontSize: 10 }}>
                            {t('Parser')}: {document.parser} · {t('Parse status')}: {document.parseStatus} · {t('Characters')}: {document.chars} · {t('Chunks')}: {document.chunks}
                          </div>
                          {document.error && <div style={{ color: '#b71c1c' }}>{document.error}</div>}
                          {document.warnings.length > 0 && <div style={{ color: '#8a5600' }}>{document.warnings.join(' · ')}</div>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
          </div>

          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 10, paddingBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('Research corpus')} ({documents.length})</div>
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {documents.length === 0 ? (
                <div style={{ color: 'var(--muted)' }}>{t('No corpus documents yet.')}</div>
              ) : documents.map(doc => (
                <div key={doc.path} style={{ padding: '3px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{doc.title || doc.path}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 10 }}>{doc.path} {doc.bytes ? `· ${(doc.bytes / 1024).toFixed(1)} KB` : ''}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteDocument(doc.path)}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11, color: '#d32f2f', padding: '0 2px' }}
                    title={t('Delete document')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 10, paddingBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('Add text source')}</div>
            <input aria-label={t('Source filename')} value={filename} onChange={e => setFilename(e.target.value)} placeholder="filename.md" style={inputStyle} />
            <textarea aria-label={t('Source content')} value={content} onChange={e => setContent(e.target.value)} placeholder={t('Paste paper notes, abstracts, snippets, or extracted text...')} style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} />
            <button onClick={addDocument} disabled={loading || !content.trim()} style={btnStyle}>{t('Add to corpus')}</button>
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('Search corpus')}</div>
            <textarea aria-label={t('Corpus query')} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Ask a literature question or paste a claim...')} style={{ ...inputStyle, minHeight: 54, resize: 'vertical' }} />
            <button onClick={runSearch} disabled={loading || !query.trim()} style={btnStyle}>{t('Search')}</button>
          </div>
        </>
      )}

      {/* ── TAB: Search results ─────────────────────────────────── */}
      {activeTab === 'search' && (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <input aria-label={t('Corpus query')} value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Search query...')} style={{ flex: 1, ...inputStyle, marginBottom: 0 }} />
            <button onClick={runSearch} disabled={loading || !query.trim()} style={btnStyle}>{t('Go')}</button>
          </div>
          {results.length > 0 ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('Evidence snippets')} ({results.length})</div>
              {results.map((item, index) => (
                <div key={item.id} style={{ marginBottom: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--paper)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>[{index + 1}] {item.source.path}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 10, marginBottom: 4 }}>{t('score')} {item.score} · {t('lines')} {item.source.lineStart}-{item.source.lineEnd}</div>
                  <div>{item.text}</div>
                </div>
              ))}
              {context && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('RAG Context (for prompt injection)')}</div>
                  <textarea readOnly value={context} style={{ ...inputStyle, minHeight: 140, resize: 'vertical', fontFamily: 'monospace' }} />
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--muted)' }}>{t('Run a search to see evidence snippets here.')}</div>
          )}
        </>
      )}

      {/* ── TAB: External search ────────────────────────────────── */}
      {activeTab === 'external' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('Search external sources')}</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              <input
                value={extSources}
                onChange={e => setExtSources(e.target.value)}
                style={{ flex: 1, ...inputStyle, marginBottom: 0, fontSize: 10 }}
                placeholder="sources: semantic-scholar,arxiv,crossref,openalex"
              />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>
              {t('Sources')}: semantic-scholar, arxiv, crossref, openalex
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                value={extQuery}
                onChange={e => setExtQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') runExternalSearch(); }}
                placeholder={t('Search title, author, or topic...')}
                style={{ flex: 1, ...inputStyle, marginBottom: 0 }}
              />
              <button onClick={runExternalSearch} disabled={extLoading || !extQuery.trim()} style={btnStyle}>
                {extLoading ? t('Searching...') : t('Search')}
              </button>
            </div>
          </div>

          {extSourceStatuses.length > 0 && (
            <div data-testid="external-source-statuses" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {extSourceStatuses.map(source => {
                const color = source.status === 'ok' ? 'var(--success)' : source.status === 'empty' ? 'var(--muted)' : 'var(--danger)';
                return (
                  <div key={source.id} data-testid={`external-source-${source.id}`} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '6px 8px', minWidth: 130, background: 'var(--paper)' }}>
                    <div style={{ fontWeight: 600, fontSize: 11 }}>{source.id}</div>
                    <div style={{ color, fontSize: 10 }}>
                      {source.status === 'ok' ? t('Source available') : source.status === 'empty' ? t('No matches') : t('Source failed')}
                      {' · '}{source.count} · {source.latencyMs} ms
                    </div>
                    {source.error && <div style={{ color: 'var(--danger)', fontSize: 9 }}>{source.error}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {extSourceStatuses.length > 0 && extResults.length === 0 && !extLoading && (
            <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 8 }}>
              {t('No external results. Check each source status to distinguish no matches from service failure.')}
            </div>
          )}

          {extResults.length > 0 && (
            <div style={{ maxHeight: 400, overflow: 'auto' }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('Results')} ({extResults.length})</div>
              {extResults.map((paper, index) => (
                <div key={`${paper.source}-${index}`} style={{ marginBottom: 8, padding: 8, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--paper)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 2 }}>{paper.title}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                    {paper.authors?.slice(0, 3).join(', ')}{paper.authors && paper.authors.length > 3 ? ' et al.' : ''}
                    {paper.year ? ` · ${paper.year}` : ''}
                    {paper.venue ? ` · ${paper.venue}` : ''}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>
                    {paper.source} · {paper.citation_count ? t('{{count}} citations', { count: paper.citation_count }) : ''}
                    {paper.doi ? ` · DOI: ${paper.doi}` : ''}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>
                    {t('Normalized source rank')}: {Number(paper.normalized_score || 0).toFixed(3)}
                    {paper.native_score !== undefined && paper.native_score !== null ? ` · ${t('Native source score')}: ${paper.native_score}` : ''}
                  </div>
                  {paper.abstract && (
                    <div style={{ fontSize: 11, marginTop: 4, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {paper.abstract.slice(0, 300)}{paper.abstract.length > 300 ? '...' : ''}
                    </div>
                  )}
                  {paper.url && (
                    <div style={{ marginTop: 4 }}>
                      <a href={paper.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--accent)' }}>
                        {t('Open')} ↗
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
              {dragOver ? t('Drop file here') : t('Drag & drop or click to upload')}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
              {t('Supported')}: .md, .txt, .tex, .bib, .pdf, .docx, .csv, .json, .html
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
            <div data-testid="rag-upload-status" data-status={uploadStatusKind} style={{ fontSize: 11, color: uploadStatusKind === 'success' ? '#2e7d32' : uploadStatusKind === 'error' ? '#d32f2f' : 'var(--muted)', marginBottom: 6 }}>
              {uploadStatus}
            </div>
          )}

          {documents.length > 0 && (
            <div>
               <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('Current corpus')} ({documents.length})</div>
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
