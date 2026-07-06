import React, { useState, useCallback, useRef, useEffect } from 'react';
import { MarkdownEditor } from './MarkdownEditor';
import { RenderedPreviewPane } from './RenderedPreviewPane';
import { DrawioEditor } from './DrawioEditor';
import { InlineDiffViewer } from './InlineDiffViewer';
import { getPaperAgentProjectId, isImagePath, isPdfPath, isPreviewableTextPath, isDrawioPath } from '../utils/previewAssets';
import { compileProject, compileFullPaper, syncTexSourceToPdf } from '../../api/client';
import { createConversation, sendMessage } from '../api/conversationApi';

interface OpenFile {
  filename: string;
  content: string;
  type: 'chapter' | 'code' | 'other';
  dirty: boolean;
}

interface PendingEdit {
  id: string;
  filename: string;
  original: string;
  new_content: string;
  stats: { added: number; removed: number };
  status: 'pending' | 'accepted' | 'rejected';
}

interface Props {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onFileChange: (index: number, content: string) => void;
  onTabSelect: (index: number) => void;
  onTabClose: (index: number) => void;
  onToggleTerminal: () => void;
  terminalVisible: boolean;
  projectPath?: string;
  editorMode?: 'markdown' | 'latex';
  chaptersCount?: number;
  projectFiles?: { path: string; type: 'file' | 'dir' }[];
  pendingEdits?: PendingEdit[];
  onAcceptEdit?: (editId: string) => void;
  onRejectEdit?: (editId: string) => void;
}

type PreviewTab = 'preview' | 'translate' | 'diff' | 'pdf';

export function CenterPanel({ openFiles, activeFileIndex, onFileChange, onTabSelect, onTabClose, onToggleTerminal, terminalVisible, projectPath, editorMode = 'latex', chaptersCount = 0, projectFiles = [], pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
  const [editorViewMode, setEditorViewMode] = useState<'source' | 'split' | 'rendered'>('split');
  const [editorRatio, setEditorRatio] = useState(0.5);
  const [previewScrollRatio, setPreviewScrollRatio] = useState<number | undefined>(undefined);
  const [editorScrollRatio, setEditorScrollRatio] = useState<number | undefined>(undefined);
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<{ ok: boolean; log?: string; error?: string; engine?: string; pdfUrl?: string; availableEngines?: string[] } | null>(null);
  const [compilingAll, setCompilingAll] = useState(false);
  const [compileAllResult, setCompileAllResult] = useState<{ ok: boolean; log?: string; error?: string; mainFile?: string; generatedMain?: boolean; engine?: string; pdfUrl?: string; availableEngines?: string[] } | null>(null);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview');
  const previousPendingEditCountRef = useRef(0);
  const [translating, setTranslating] = useState(false);
  const [translationResult, setTranslationResult] = useState<string>('');
  const [translationError, setTranslationError] = useState<string>('');
  const translateConvIdRef = useRef<string | null>(null);
  const autoCompileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const scrollSourceRef = useRef<'editor' | 'preview' | null>(null);
  const activeFile = openFiles?.[activeFileIndex];
  const projectId = getPaperAgentProjectId(projectPath);
  const texFiles = projectFiles
    .filter(file => file.type === 'file' && file.path.toLowerCase().endsWith('.tex'))
    .map(file => file.path)
    .sort((a, b) => a.localeCompare(b));
  const suggestedMainFile = texFiles.find(file => file === 'main.tex')
    || texFiles.find(file => file.endsWith('/main.tex'))
    || texFiles[0]
    || 'main.tex';
  const mainFileStorageKey = projectId ? `paper-agent-main-file:${projectId}` : '';
  const [compileTarget, setCompileTarget] = useState<'main' | 'current'>('main');
  const [defaultMainFile, setDefaultMainFile] = useState(suggestedMainFile);
  const activeIsImage = !!activeFile && isImagePath(activeFile.filename);
  const activeIsPdf = !!activeFile && isPdfPath(activeFile.filename);
  const activeIsText = !!activeFile && isPreviewableTextPath(activeFile.filename);
  const activeIsDrawio = !!activeFile && isDrawioPath(activeFile.filename);
  const isChapterLike = activeFile?.type === 'chapter' || (activeFile?.type === 'other' && activeIsText);
  const showSource = isChapterLike && (editorViewMode === 'source' || editorViewMode === 'split');

  useEffect(() => {
    if (!mainFileStorageKey) return;
    const saved = localStorage.getItem(mainFileStorageKey);
    setDefaultMainFile(saved && texFiles.includes(saved) ? saved : suggestedMainFile);
  }, [mainFileStorageKey, suggestedMainFile, projectFiles]);

  const updateDefaultMainFile = useCallback((file: string) => {
    setDefaultMainFile(file);
    if (mainFileStorageKey) localStorage.setItem(mainFileStorageKey, file);
  }, [mainFileStorageKey]);

  useEffect(() => {
    const pendingCount = pendingEdits.filter(edit => edit.status === 'pending').length;
    if (pendingCount > previousPendingEditCountRef.current) setPreviewTab('diff');
    previousPendingEditCountRef.current = pendingCount;
  }, [pendingEdits]);
  const showPreview = activeFile?.type === 'chapter' && (editorViewMode === 'split' || editorViewMode === 'rendered');

  // SyncTeX: jump from source line to PDF position
  const handleSyncTeXJump = useCallback(async (line: number) => {
    if (!projectId || !activeFile) return;
    try {
      const result = await syncTexSourceToPdf({
        projectId,
        file: activeFile.filename,
        line,
      });
      if (result.ok && result.page !== undefined) {
        // Scroll the preview to the target position
        // For LatexPreview, we approximate by scrolling to a ratio based on page number
        // A more precise implementation would use PDF.js to scroll to exact coordinates
        const estimatedRatio = Math.min(0.95, Math.max(0, (result.page - 1) * 0.15));
        setPreviewScrollRatio(estimatedRatio);
      }
    } catch {
      // SyncTeX not available or failed — silent fallback
    }
  }, [projectId, activeFile]);

  // Translation function - reuses conversation to avoid creating new chat per send
  const handleTranslate = useCallback(async () => {
    if (!projectId || !activeFile?.content?.trim()) return;
    setPreviewTab('translate');
    setTranslating(true);
    setTranslationError('');
    try {
      const content = activeFile.content.slice(0, 30000);
      const prompt = [
        '请将下面这份论文预览内容翻译成中文。要求：',
        '1. 只输出译文，不要解释。',
        '2. 保留章节标题、编号、公式占位、引用标记和列表结构。',
        '3. 对 LaTeX/Markdown 命令按渲染含义翻译，无法渲染的命令可保留原样。',
        '4. 学术术语保持准确，英文专有名词可在中文后保留括号英文。',
        '',
        content,
      ].join('\n');
      let convId = translateConvIdRef.current;
      if (!convId) {
        const conv = await createConversation(projectId, {
          name: 'Preview Translate',
          context_scope: { type: 'free' },
          mode: 'chat',
        });
        convId = conv.id;
        translateConvIdRef.current = conv.id;
      }
      const result = await sendMessage(projectId, convId, projectPath || '', prompt, {});
      setTranslationResult(result.reply || result.message || result.text || '');
    } catch (err: any) {
      setTranslationError(err?.message || String(err));
    } finally {
      setTranslating(false);
    }
  }, [projectId, activeFile?.content, projectPath]);

  // Auto-compile on content change when preview tab is active
  const handleContentChangeWithAutoCompile = useCallback((index: number, content: string) => {
    onFileChange(index, content);
    if (autoCompileTimerRef.current) {
      clearTimeout(autoCompileTimerRef.current);
    }
    autoCompileTimerRef.current = setTimeout(() => {
      if (previewTab === 'preview' && !compiling && projectId) {
        handleCompileAll();
      }
    }, 2500);
  }, [onFileChange, previewTab, compiling, projectId]);


  const handleEditorPreviewResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = editorAreaRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: MouseEvent) => {
      const ratio = (ev.clientX - rect.left) / rect.width;
      setEditorRatio(Math.max(0.2, Math.min(0.8, ratio)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  const handleEditorScroll = useCallback((ratio: number) => {
    if (!syncScrollEnabled || scrollSourceRef.current === 'preview') return;
    scrollSourceRef.current = 'editor';
    setPreviewScrollRatio(ratio);
    requestAnimationFrame(() => { scrollSourceRef.current = null; });
  }, [syncScrollEnabled]);

  const handlePreviewScroll = useCallback((ratio: number) => {
    if (!syncScrollEnabled || scrollSourceRef.current === 'editor') return;
    scrollSourceRef.current = 'preview';
    setEditorScrollRatio(ratio);
    requestAnimationFrame(() => { scrollSourceRef.current = null; });
  }, [syncScrollEnabled]);

  const handleCompile = useCallback(async () => {
    if (!projectId || compiling) return;
    setCompiling(true);
    setCompileResult(null);
    try {
      const result = await compileProject({ projectId, mainFile: activeFile?.filename || 'main.tex', engine: 'auto' });
      setCompileResult(result);
      if (result.ok && result.pdfUrl) {
        setCompiledPdfUrl(`${result.pdfUrl}&_t=${Date.now()}`);
      }
    } catch (e: any) {
      setCompileResult({ ok: false, error: e.message });
    } finally {
      setCompiling(false);
    }
  }, [projectId, compiling, activeFile?.filename]);

  const handleCompileAll = useCallback(async () => {
    if (!projectId || compilingAll) return;
    setCompilingAll(true);
    setCompileAllResult(null);
    try {
      const result = compileTarget === 'current'
        ? await compileProject({ projectId, mainFile: activeFile?.filename || defaultMainFile, engine: 'auto' })
        : await compileFullPaper({ projectId, mainFile: defaultMainFile, engine: 'auto', editorMode });
      setCompileAllResult(result);
      if (result.ok && result.pdfUrl) {
        // Add cache-busting timestamp so the browser fetches the fresh PDF
        setCompiledPdfUrl(`${result.pdfUrl}&_t=${Date.now()}`);
      }
    } catch (e: any) {
      setCompileAllResult({ ok: false, error: e.message });
    } finally {
      setCompilingAll(false);
    }
  }, [projectId, compilingAll, editorMode, compileTarget, activeFile?.filename, defaultMainFile]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Tab bar */}
      <div style={{ height: '38px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 10px', gap: '2px', overflow: 'auto', flexShrink: 0, background: 'var(--panel-muted)' }}>
        {(openFiles || []).map((file, i) => (
          <div
            key={`${file.filename}-${i}`}
            onClick={() => onTabSelect(i)}
            style={{
              padding: '5px 14px',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '6px 6px 0 0',
              background: i === activeFileIndex ? 'var(--paper)' : 'transparent',
              borderBottom: i === activeFileIndex ? '2px solid var(--accent)' : '2px solid transparent',
              color: i === activeFileIndex ? 'var(--accent-strong)' : 'var(--text-secondary)',
              fontWeight: i === activeFileIndex ? 500 : 400,
              transition: 'all 0.15s ease',
            }}
          >
            {file.filename}{file.dirty ? ' •' : ''}
            <span onClick={(e) => { e.stopPropagation(); onTabClose(i); }} style={{ marginLeft: '8px', color: 'var(--muted)', cursor: 'pointer', opacity: 0.6, fontSize: '13px' }}>×</span>
          </div>
        ))}
        {activeFile && activeFile.type === 'chapter' && (
          <div style={{ marginLeft: '8px', display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--paper)' }} title="Editor view mode">
            {(['source', 'split', 'rendered'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setEditorViewMode(mode)}
                style={{
                  fontSize: '11px',
                  border: 'none',
                  borderRight: mode === 'rendered' ? 'none' : '1px solid var(--border)',
                  padding: '3px 9px',
                  cursor: 'pointer',
                  background: editorViewMode === mode ? 'var(--accent-soft)' : 'transparent',
                  color: editorViewMode === mode ? 'var(--accent-strong)' : 'var(--text-secondary)',
                  fontWeight: editorViewMode === mode ? 600 : 500,
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {mode === 'rendered' ? 'Rendered' : mode}
              </button>
            ))}
          </div>
        )}
        {activeFile && activeFile.type === 'chapter' && editorViewMode === 'split' && (
          <button
            onClick={() => setSyncScrollEnabled(v => !v)}
            title={syncScrollEnabled ? 'Disable sync scroll' : 'Enable sync scroll'}
            style={{
              marginLeft: '6px',
              fontSize: '11px',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '3px 8px',
              cursor: 'pointer',
              background: syncScrollEnabled ? 'var(--accent-soft)' : 'transparent',
              color: syncScrollEnabled ? 'var(--accent-strong)' : 'var(--muted)',
              fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            {syncScrollEnabled ? 'Sync' : 'Free'}
          </button>
        )}
        {activeFile && activeFile.filename.toLowerCase().endsWith('.tex') && (
          <select
            value={compileTarget}
            onChange={event => setCompileTarget(event.target.value as 'main' | 'current')}
            title="Choose whether to compile the project's default main file or the current file"
            style={{ marginLeft: '6px', maxWidth: 112, fontSize: '11px', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 5px', background: 'var(--paper)', color: 'var(--text)' }}
          >
            <option value="main">Main document</option>
            <option value="current">Current file</option>
          </select>
        )}
        {activeFile && activeFile.filename.toLowerCase().endsWith('.tex') && compileTarget === 'main' && (
          <select
            value={defaultMainFile}
            onChange={event => updateDefaultMainFile(event.target.value)}
            title="Default main .tex file for this project"
            style={{ maxWidth: 190, fontSize: '11px', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 5px', background: 'var(--paper)', color: 'var(--text)' }}
          >
            {texFiles.map(file => <option key={file} value={file}>{file}</option>)}
          </select>
        )}
        {activeFile && activeFile.filename.toLowerCase().endsWith('.tex') && (
          <button
            onClick={handleCompileAll}
            disabled={compilingAll || !projectId}
            title={compileTarget === 'main' ? `Compile default main file: ${defaultMainFile}` : `Compile current file: ${activeFile.filename}`}
            style={{
              marginLeft: '4px',
              fontSize: '11px',
              border: '1px solid var(--accent)',
              borderRadius: '6px',
              padding: '3px 8px',
              cursor: compilingAll || !projectId ? 'wait' : 'pointer',
              background: compilingAll ? 'var(--accent-soft)' : 'var(--accent)',
              color: '#fff',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {compilingAll ? 'Compiling...' : compileAllResult?.ok ? 'View PDF' : 'Compile'}
          </button>
        )}
      </div>

      {/* Editor + Preview area */}
      {activeFile ? (
        <div ref={editorAreaRef} style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          {activeIsImage ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--paper)', overflow: 'auto' }}>
              {projectId ? (
                <img
                  src={`/api/projects/${encodeURIComponent(projectId)}/blob?${new URLSearchParams({ path: activeFile.filename }).toString()}`}
                  alt={activeFile.filename}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--paper)' }}
                />
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>Image preview is available for project files.</div>
              )}
            </div>
          ) : activeIsPdf ? (
            <div style={{ flex: 1, minWidth: 0, background: 'var(--paper)', overflow: 'hidden' }}>
              {projectId ? (
                <embed
                  src={`/api/projects/${encodeURIComponent(projectId)}/blob?${new URLSearchParams({ path: activeFile.filename }).toString()}`}
                  type="application/pdf"
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>PDF preview is available for project files.</div>
              )}
            </div>
          ) : activeIsDrawio ? (
            <DrawioEditor
              content={activeFile.content}
              onChange={(c) => handleContentChangeWithAutoCompile(activeFileIndex, c)}
              projectId={projectId}
              currentFile={activeFile.filename}
            />
          ) : activeFile.type === 'other' && !activeIsText ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--paper)', color: 'var(--muted)', gap: 8 }}>
              <div style={{ fontSize: 36, opacity: 0.3 }}>📎</div>
              <p style={{ margin: 0, fontSize: 13 }}>{activeFile.filename}</p>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>Binary file — no inline preview</p>
            </div>
          ) : (
            <>
              {showSource && (
                <div style={{ width: showPreview ? `${editorRatio * 100}%` : '100%', overflow: 'hidden' }}>
                  <MarkdownEditor
                    content={activeFile.content}
                    onChange={(c) => handleContentChangeWithAutoCompile(activeFileIndex, c)}
                    onScroll={editorViewMode === 'split' ? handleEditorScroll : undefined}
                    scrollRatio={editorViewMode === 'split' ? editorScrollRatio : undefined}
                    onLineClick={handleSyncTeXJump}
                  />
                </div>
              )}
              {showSource && showPreview && (
                <>
                  <div
                    onMouseDown={handleEditorPreviewResize}
                    style={{ width: '5px', cursor: 'col-resize', background: 'var(--border)', flexShrink: 0, position: 'relative', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--border)')}
                  >
                    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '3px', height: '30px', borderRadius: '2px', background: 'var(--muted)', opacity: 0.4 }} />
                  </div>
                </>
              )}
              {showPreview && (
                  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#f5f5f0' }}>
                    {/* Preview tab bar */}
                    <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--panel-muted)', flexShrink: 0, padding: '0 8px' }}>
                      {(['preview', 'translate', 'diff', 'pdf'] as PreviewTab[]).map(tab => (
                        <button
                          key={tab === 'preview' ? 'Preview' : tab === 'translate' ? '翻译' : tab === 'diff' ? 'Diff' : tab === 'pdf' ? 'PDF' : tab}
                          onClick={() => { if (tab === 'translate') handleTranslate(); else { setPreviewTab(tab); if (tab === 'preview' && !compilingAll) handleCompileAll(); } }}
                          style={{
                            padding: '5px 10px',
                            border: 'none',
                            borderBottom: previewTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
                            background: 'none',
                            color: previewTab === tab ? 'var(--accent-strong)' : 'var(--muted)',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textTransform: 'uppercase',
                          }}
                        >
                          {tab === 'preview' ? 'Preview' : tab === 'translate' ? '翻译' : tab === 'diff' ? 'Diff' : tab === 'pdf' ? 'PDF' : tab}
                          {tab === 'diff' && pendingEdits.filter(e => e.status === 'pending').length > 0 && (
                            <span style={{ marginLeft: '4px', background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '0 5px', fontSize: '10px' }}>
                              {pendingEdits.filter(e => e.status === 'pending').length}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {/* Preview content */}
                    <div style={{ flex: 1, overflow: 'auto' }}>
                      {(previewTab === 'pdf' || previewTab === 'preview') && compiledPdfUrl ? (
                        // Show compiled PDF when available (Overleaf-style)
                        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                          <div style={{ padding: '6px 12px', background: 'var(--panel-muted)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                              ✓ Compiled PDF ({compileAllResult?.engine || 'pdflatex'})
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => window.open(compiledPdfUrl, '_blank')}
                                style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}
                              >
                                Open in Tab
                              </button>
                              <button
                                onClick={() => setCompiledPdfUrl(null)}
                                style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}
                              >
                                × Clear
                              </button>
                            </div>
                          </div>
                          <embed
                            src={compiledPdfUrl}
                            type="application/pdf"
                            style={{ flex: 1, width: '100%', border: 0 }}
                          />
                        </div>
                      ) : (previewTab === 'pdf' || previewTab === 'preview') ? (
                        <RenderedPreviewPane
                          content={activeFile.content}
                          filename={activeFile.filename}
                          projectId={projectId}
                          currentFile={activeFile.filename}
                          onScroll={handlePreviewScroll}
                          scrollRatio={previewScrollRatio}
                        />
                      ) : null}
                      
                      {previewTab === 'translate' && (
                        <div style={{ minHeight: '100%', padding: '14px', background: 'var(--paper)', color: 'var(--text)', fontSize: '13px', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                          {translating ? '翻译中...' : translationError ? (
                            <div style={{ color: 'var(--danger)' }}>{translationError}</div>
                          ) : translationResult || '点击"翻译"按钮翻译当前文档内容。'}
                        </div>
                      )}
{previewTab === 'diff' && (
                        <div style={{ padding: '12px' }}>
                          {pendingEdits.filter(e => e.status === 'pending').length === 0 ? (
                            <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '24px' }}>
                              No pending edits. Use Agent mode to propose changes.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                                DIFF PREVIEW ({pendingEdits.filter(e => e.status === 'pending').length})
                              </div>
                              {pendingEdits.filter(e => e.status === 'pending').map(edit => (
                                <InlineDiffViewer
                                  key={edit.id}
                                  original={edit.original}
                                  proposed={edit.new_content}
                                  filename={edit.filename}
                                  stats={edit.stats}
                                  error={edit.error}
                                  onAccept={() => onAcceptEdit?.(edit.id)}
                                  onReject={() => onRejectEdit?.(edit.id)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--muted)' }}>
          <div style={{ fontSize: '36px', opacity: 0.25 }}>📄</div>
          <p style={{ margin: 0, fontSize: '13px' }}>Open a file from the project tree</p>
        </div>
      )}

      {/* Compile result popup */}
      {compileResult && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            width: '480px',
            maxHeight: '360px',
            background: 'var(--panel)',
            border: `1px solid ${compileResult.ok ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)'}`,
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '10px 14px',
            background: compileResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderBottom: `1px solid ${compileResult.ok ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: compileResult.ok ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)' }}>
              {compileResult.ok ? 'Compile Success' : 'Compile Failed'}
            </span>
            <button
              onClick={() => setCompileResult(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--muted)' }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
            {compileResult.log || compileResult.error}
          </div>
        </div>
      )}

      {/* Compile All result popup */}
      {compileAllResult && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: compileResult ? '510px' : '20px',
            width: '480px',
            maxHeight: '360px',
            background: 'var(--panel)',
            border: `1px solid ${compileAllResult.ok ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)'}`,
            borderRadius: '8px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '10px 14px',
            background: compileAllResult.ok ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            borderBottom: `1px solid ${compileAllResult.ok ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: compileAllResult.ok ? 'var(--success, #10b981)' : 'var(--danger, #ef4444)' }}>
              {compileAllResult.ok ? `Full Paper Compiled (${compileAllResult.engine || 'pdflatex'})` : 'Full Paper Compile Failed'}
            </span>
            <button
              onClick={() => setCompileAllResult(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--muted)' }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
            {compileAllResult.log || compileAllResult.error}
          </div>
        </div>
      )}
    </div>
  );
}
