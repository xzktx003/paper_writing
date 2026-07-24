import React, { lazy, Suspense, useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { InlineDiffViewer } from './InlineDiffViewer';
import { getPaperAgentProjectId, isImagePath, isPdfPath, isPreviewableTextPath, isDrawioPath } from '../utils/previewAssets';
import { compileProject, compileFullPaper, getLatestCompiledPdf, syncTexSourceToPdf } from '../../api/client';
import { createConversation, deleteConversation, sendMessageStream } from '../api/conversationApi';
import { managedProjectRequest } from '../api/projectRequestContext';
import { AuthenticatedImage, AuthenticatedPdf, openAuthenticatedFile } from './AuthenticatedAsset';

const MarkdownEditor = lazy(() => import('./MarkdownEditor').then(module => ({ default: module.MarkdownEditor })));
const RenderedPreviewPane = lazy(() => import('./RenderedPreviewPane').then(module => ({ default: module.RenderedPreviewPane })));
const DrawioEditor = lazy(() => import('./DrawioEditor').then(module => ({ default: module.DrawioEditor })));

function EditorSurfaceLoader() {
  const { t } = useTranslation();
  return <div role="status" style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 12 }}>{t('Loading editor surface…')}</div>;
}

type CompileDiagnostic = { code: string; message: string; line?: string };
type CompileResult = {
  ok: boolean;
  log?: string;
  error?: string;
  status?: 'success' | 'warning' | 'failed';
  warnings?: CompileDiagnostic[];
  errors?: CompileDiagnostic[];
  engine?: string;
  pdfUrl?: string;
  availableEngines?: string[];
  mainFile?: string;
  generatedMain?: boolean;
};

function compileTone(result: CompileResult) {
  if (!result.ok || result.status === 'failed') return 'var(--danger, #ef4444)';
  if (result.status === 'warning') return 'var(--warning, #d97706)';
  return 'var(--success, #10b981)';
}

function compileBackground(result: CompileResult) {
  if (!result.ok || result.status === 'failed') return 'rgba(239, 68, 68, 0.1)';
  if (result.status === 'warning') return 'rgba(217, 119, 6, 0.12)';
  return 'rgba(16, 185, 129, 0.1)';
}

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
  error?: string;
}

interface Props {
  openFiles: OpenFile[];
  activeFileIndex: number;
  onFileChange: (index: number, content: string) => void;
  onFileSave: (index: number) => Promise<void>;
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
type TranslationState = { result: string; error: string };

export function CenterPanel({ openFiles, activeFileIndex, onFileChange, onFileSave, onTabSelect, onTabClose, onToggleTerminal, terminalVisible, projectPath, editorMode = 'latex', chaptersCount = 0, projectFiles = [], pendingEdits = [], onAcceptEdit, onRejectEdit }: Props) {
  const { t } = useTranslation();
  const [editorViewMode, setEditorViewMode] = useState<'source' | 'split' | 'rendered'>('split');
  const [editorRatio, setEditorRatio] = useState(0.5);
  const [previewScrollRatio, setPreviewScrollRatio] = useState<number | undefined>(undefined);
  const [editorScrollRatio, setEditorScrollRatio] = useState<number | undefined>(undefined);
  const [syncScrollEnabled, setSyncScrollEnabled] = useState(true);
  const [compiling, setCompiling] = useState(false);
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [compilingAll, setCompilingAll] = useState(false);
  const [compileAllResult, setCompileAllResult] = useState<CompileResult | null>(null);
  const [compiledPdfUrl, setCompiledPdfUrl] = useState<string | null>(null);
  const [compiledPdfSource, setCompiledPdfSource] = useState<'cached' | 'fresh' | null>(null);
  const [loadingLatestPdf, setLoadingLatestPdf] = useState(false);
  const [latestPdfChecked, setLatestPdfChecked] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('preview');
  const previousPendingEditCountRef = useRef(0);
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const [translatingFiles, setTranslatingFiles] = useState<Record<string, boolean>>({});
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const scrollSourceRef = useRef<'editor' | 'preview' | null>(null);
  const activeFile = openFiles?.[activeFileIndex];
  const translationState = activeFile ? translations[activeFile.filename] : undefined;
  const translationResult = translationState?.result || '';
  const translationError = translationState?.error || '';
  const translating = activeFile ? Boolean(translatingFiles[activeFile.filename]) : false;
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
  const restoredEditorLayoutRef = useRef<string | null>(null);
  const activeIsImage = !!activeFile && isImagePath(activeFile.filename);
  const activeIsPdf = !!activeFile && isPdfPath(activeFile.filename);
  const activeIsText = !!activeFile && isPreviewableTextPath(activeFile.filename);
  const activeIsDrawio = !!activeFile && isDrawioPath(activeFile.filename);
  const isChapterLike = activeFile?.type === 'chapter' || (activeFile?.type === 'other' && activeIsText);
  const showSource = isChapterLike && (editorViewMode === 'source' || editorViewMode === 'split');

  const saveActiveFile = useCallback(async () => {
    if (!activeFile || activeFileIndex < 0 || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onFileSave(activeFileIndex);
    } catch (error) {
      setSaveError(t('保存失败: {{error}}', { error: error instanceof Error ? error.message : String(error) }));
    } finally {
      setSaving(false);
    }
  }, [activeFile, activeFileIndex, onFileSave, saving, t]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (activeFile?.dirty) void saveActiveFile();
      }
    };
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, [activeFile?.dirty, saveActiveFile]);

  useEffect(() => {
    if (!projectPath) return;
    restoredEditorLayoutRef.current = null;
    try {
      const saved = JSON.parse(localStorage.getItem(`paper-agent-editor-layout:${projectPath}`) || 'null');
      if (['source', 'split', 'rendered'].includes(saved?.editorViewMode)) setEditorViewMode(saved.editorViewMode);
      if (Number.isFinite(saved?.editorRatio)) setEditorRatio(Math.max(0.2, Math.min(0.8, saved.editorRatio)));
      if (typeof saved?.syncScrollEnabled === 'boolean') setSyncScrollEnabled(saved.syncScrollEnabled);
      if (saved?.compileTarget === 'main' || saved?.compileTarget === 'current') setCompileTarget(saved.compileTarget);
    } catch { /* ignore invalid browser state */ }
    restoredEditorLayoutRef.current = projectPath;
  }, [projectPath]);

  useEffect(() => {
    if (!projectPath || restoredEditorLayoutRef.current !== projectPath) return;
    localStorage.setItem(`paper-agent-editor-layout:${projectPath}`, JSON.stringify({
      editorViewMode,
      editorRatio,
      syncScrollEnabled,
      compileTarget,
    }));
  }, [projectPath, editorViewMode, editorRatio, syncScrollEnabled, compileTarget]);

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

  // Translation uses the same streaming provider path as chat, then removes its temporary conversation.
  const handleTranslate = useCallback(async (force = false) => {
    if (!projectId || !activeFile?.content?.trim()) return;
    const filename = activeFile.filename;
    setPreviewTab('translate');
    if (!force && translations[filename]?.result) return;
    if (translatingFiles[filename]) return;
    setTranslatingFiles((current) => ({ ...current, [filename]: true }));
    setTranslations((current) => ({ ...current, [filename]: { result: '', error: '' } }));
    let convId: string | null = null;
    try {
      const content = activeFile.content.slice(0, 30000);
      const prompt = [
        '请将下面这份论文内容翻译成中文 Markdown。要求：',
        '1. 只输出有效的 GitHub Flavored Markdown，不要解释，也不要使用包裹全文的代码块。',
        '2. 将 LaTeX 的 section/subsection/paragraph 等结构转换为对应层级的 Markdown 标题。',
        '3. 保留章节编号、引用标记、交叉引用、列表、表格、代码和图片语义。',
        '4. 学术术语保持准确，英文专有名词可在中文后保留括号英文。',
        '5. 将行内公式转换为 `$...$`，保持公式内部 LaTeX 不变。',
        '6. 将独立公式转换为 `$$...$$`，包括 `\\[...\\]` 和 equation/align 环境；不要把公式放进代码块。',
        '7. 若公式使用项目自定义宏（例如 `\\vx`、`\\mG`、`\\mE`），请在不改变数学含义的前提下展开为 KaTeX 支持的标准 LaTeX 命令。',
        '8. 移除公式内部的 `\\label{...}` 等仅供 LaTeX 编译使用且 KaTeX 不支持的命令；在公式外保留必要的编号或引用说明。',
        '9. 不要翻译公式变量、引用键、文件路径和代码标识符。',
        '',
        content,
      ].join('\n');
      const conv = await createConversation(projectId, {
        name: 'Preview Translate',
        context_scope: { type: 'free' },
        mode: 'chat',
      });
      convId = conv.id;

      let streamedText = '';
      let completedText = '';
      let streamError = '';
      await sendMessageStream(
        projectId,
        convId,
        managedProjectRequest(projectId),
        prompt,
        {},
        undefined,
        {
          onToken: (text) => {
            streamedText += text;
            setTranslations((current) => ({
              ...current,
              [filename]: { result: streamedText, error: '' },
            }));
          },
          onDone: (fullText) => {
            completedText = fullText || streamedText;
            setTranslations((current) => ({
              ...current,
              [filename]: { result: completedText, error: '' },
            }));
          },
          onError: (message) => {
            streamError = message;
            setTranslations((current) => ({
              ...current,
              [filename]: { result: '', error: message },
            }));
          },
        },
        { ephemeralConversation: true },
      );
      if (streamError) throw new Error(streamError);
      if (!(completedText || streamedText).trim()) throw new Error(t('Translation returned no content.'));
    } catch (err: any) {
      setTranslations((current) => ({
        ...current,
        [filename]: { result: '', error: err?.message || String(err) },
      }));
    } finally {
      if (convId) {
        // The backend owns lifecycle cleanup; this only covers failures before the stream reaches it.
        await deleteConversation(projectId, convId).catch(() => {});
      }
      setTranslatingFiles((current) => {
        const next = { ...current };
        delete next[filename];
        return next;
      });
    }
  }, [projectId, activeFile, translatingFiles, translations, t]);

  // Editing only changes the source. Full compilation is always user-triggered.
  const handleContentChange = useCallback((index: number, content: string) => {
    onFileChange(index, content);
  }, [onFileChange]);


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
        setCompiledPdfSource('fresh');
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
        setCompiledPdfSource('fresh');
        setLatestPdfChecked(true);
      }
    } catch (e: any) {
      setCompileAllResult({ ok: false, error: e.message });
    } finally {
      setCompilingAll(false);
    }
  }, [projectId, compilingAll, editorMode, compileTarget, activeFile?.filename, defaultMainFile]);

  const loadLatestCompiledPdf = useCallback(async () => {
    if (!projectId || loadingLatestPdf) return;
    const mainFile = compileTarget === 'current'
      ? activeFile?.filename || defaultMainFile
      : defaultMainFile;
    setLoadingLatestPdf(true);
    setLatestPdfChecked(false);
    try {
      const latest = await getLatestCompiledPdf(projectId, mainFile);
      if (latest.ok && latest.found && latest.pdfUrl) {
        const separator = latest.pdfUrl.includes('?') ? '&' : '?';
        setCompiledPdfUrl(`${latest.pdfUrl}${separator}_t=${latest.version || Date.now()}`);
        setCompiledPdfSource('cached');
      } else {
        setCompiledPdfUrl(null);
        setCompiledPdfSource(null);
      }
    } catch {
      setCompiledPdfUrl(null);
      setCompiledPdfSource(null);
    } finally {
      setLoadingLatestPdf(false);
      setLatestPdfChecked(true);
    }
  }, [projectId, loadingLatestPdf, compileTarget, activeFile?.filename, defaultMainFile]);

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
        {activeFile && activeIsText && (
          <button
            className="btn ghost"
            data-testid="manual-save-button"
            type="button"
            disabled={!activeFile.dirty || saving}
            onClick={() => void saveActiveFile()}
            title={t('手动保存当前文件（Ctrl/Cmd+S）')}
            style={{ marginLeft: 'auto', flexShrink: 0, padding: '3px 9px', fontSize: 11 }}
          >
            {saving ? t('保存中...') : t('保存')}
          </button>
        )}
        {saveError && <small role="alert" style={{ color: 'var(--danger)', flexShrink: 0 }}>{saveError}</small>}
        {activeFile && activeFile.type === 'chapter' && (
          <div style={{ marginLeft: '8px', display: 'inline-flex', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', background: 'var(--paper)' }} title={t('Editor view mode')}>
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
                {t(mode === 'rendered' ? 'Rendered' : mode)}
              </button>
            ))}
          </div>
        )}
        {activeFile && activeFile.type === 'chapter' && editorViewMode === 'split' && (
          <button
            onClick={() => setSyncScrollEnabled(v => !v)}
            title={syncScrollEnabled ? t('Disable sync scroll') : t('Enable sync scroll')}
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
            {syncScrollEnabled ? t('Sync') : t('Free')}
          </button>
        )}
        {activeFile && activeFile.filename.toLowerCase().endsWith('.tex') && (
          <select
            value={compileTarget}
            onChange={event => setCompileTarget(event.target.value as 'main' | 'current')}
            title={t("Choose whether to compile the project's default main file or the current file")}
            style={{ marginLeft: '6px', maxWidth: 112, fontSize: '11px', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 5px', background: 'var(--paper)', color: 'var(--text)' }}
          >
            <option value="main">{t('Main document')}</option>
            <option value="current">{t('Current file')}</option>
          </select>
        )}
        {activeFile && activeFile.filename.toLowerCase().endsWith('.tex') && compileTarget === 'main' && (
          <select
            value={defaultMainFile}
            onChange={event => updateDefaultMainFile(event.target.value)}
            title={t('Default main .tex file for this project')}
            style={{ maxWidth: 190, fontSize: '11px', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 5px', background: 'var(--paper)', color: 'var(--text)' }}
          >
            {texFiles.map(file => <option key={file} value={file}>{file}</option>)}
          </select>
        )}
        {activeFile && activeFile.filename.toLowerCase().endsWith('.tex') && (
          <button
            onClick={handleCompileAll}
            disabled={compilingAll || !projectId}
            title={compileTarget === 'main' ? t('Compile default main file: {{file}}', { file: defaultMainFile }) : t('Compile current file: {{file}}', { file: activeFile.filename })}
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
            {compilingAll ? t('Compiling...') : compileAllResult?.ok ? t('Recompile') : t('Compile')}
          </button>
        )}
      </div>

      {/* Editor + Preview area */}
      {activeFile ? (
        <div ref={editorAreaRef} style={{ flex: 1, display: 'flex', flexDirection: 'row', overflow: 'hidden' }}>
          {activeIsImage ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--paper)', overflow: 'auto' }}>
              {projectId ? (
                <AuthenticatedImage
                  src={`/api/projects/${encodeURIComponent(projectId)}/blob?${new URLSearchParams({ path: activeFile.filename }).toString()}`}
                  title={activeFile.filename}
                  loadingLabel={t('Loading protected asset…')}
                  errorLabel={t('Failed to load protected asset.')}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--paper)' }}
                />
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('Image preview is available for project files.')}</div>
              )}
            </div>
          ) : activeIsPdf ? (
            <div style={{ flex: 1, minWidth: 0, background: 'var(--paper)', overflow: 'hidden' }}>
              {projectId ? (
                <AuthenticatedPdf
                  src={`/api/projects/${encodeURIComponent(projectId)}/blob?${new URLSearchParams({ path: activeFile.filename }).toString()}`}
                  title={activeFile.filename}
                  loadingLabel={t('Loading protected asset…')}
                  errorLabel={t('Failed to load protected asset.')}
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              ) : (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('PDF preview is available for project files.')}</div>
              )}
            </div>
          ) : activeIsDrawio ? (
            <Suspense fallback={<EditorSurfaceLoader />}>
              <DrawioEditor
                content={activeFile.content}
                onChange={(c) => handleContentChange(activeFileIndex, c)}
                projectId={projectId}
                currentFile={activeFile.filename}
              />
            </Suspense>
          ) : activeFile.type === 'other' && !activeIsText ? (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--paper)', color: 'var(--muted)', gap: 8 }}>
              <div style={{ fontSize: 36, opacity: 0.3 }}>📎</div>
              <p style={{ margin: 0, fontSize: 13 }}>{activeFile.filename}</p>
              <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>{t('Binary file — no inline preview')}</p>
            </div>
          ) : (
            <>
              {showSource && (
                <div style={{ width: showPreview ? `${editorRatio * 100}%` : '100%', overflow: 'hidden' }}>
                  <Suspense fallback={<EditorSurfaceLoader />}>
                    <MarkdownEditor
                      key={activeFile.filename}
                      content={activeFile.content}
                      filename={activeFile.filename}
                      onChange={(c) => handleContentChange(activeFileIndex, c)}
                      onScroll={editorViewMode === 'split' ? handleEditorScroll : undefined}
                      scrollRatio={editorViewMode === 'split' ? editorScrollRatio : undefined}
                      onLineClick={handleSyncTeXJump}
                    />
                  </Suspense>
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
                          key={tab}
                          onClick={() => {
                            if (tab === 'translate') void handleTranslate(false);
                            else {
                              setPreviewTab(tab);
                              if (tab === 'pdf') void loadLatestCompiledPdf();
                            }
                          }}
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
                          {tab === 'preview' ? t('Quick Preview') : tab === 'translate' ? t('Translate') : tab === 'diff' ? t('Diff') : tab === 'pdf' ? t('Final PDF') : tab}
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
                              ✓ {compiledPdfSource === 'cached'
                                ? t('Previous compiled PDF')
                                : `${t('Compiled PDF')} (${compileAllResult?.engine || 'pdflatex'})`}
                            </span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={handleCompileAll}
                                disabled={compilingAll || !projectId}
                                style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: '10px', cursor: compilingAll || !projectId ? 'wait' : 'pointer' }}
                              >
                                {compilingAll ? t('Compiling final PDF…') : t('Recompile final PDF')}
                              </button>
                              <button
                                onClick={() => void openAuthenticatedFile(compiledPdfUrl)}
                                style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}
                              >
                                {t('Open in Tab')}
                              </button>
                              <button
                                onClick={() => setCompiledPdfUrl(null)}
                                style={{ padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--paper)', color: 'var(--text-secondary)', fontSize: '10px', cursor: 'pointer' }}
                              >
                                × {t('Clear')}
                              </button>
                            </div>
                          </div>
                          <AuthenticatedPdf
                            src={compiledPdfUrl}
                            title={t('Compiled PDF')}
                            loadingLabel={t('Loading protected asset…')}
                            errorLabel={t('Failed to load protected asset.')}
                            style={{ flex: 1, width: '100%', height: '100%', border: 0 }}
                          />
                        </div>
                      ) : previewTab === 'pdf' ? (
                        <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 24, background: 'var(--paper)' }}>
                          <div style={{ maxWidth: 420, textAlign: 'center', color: 'var(--text)' }}>
                            <strong style={{ display: 'block', marginBottom: 8 }}>{t('Final typeset output requires LaTeX compilation')}</strong>
                            <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
                              {t('References, packages, fonts, layout, and figures are authoritative only in the compiled PDF.')}
                            </p>
                            <button
                              type="button"
                              onClick={handleCompileAll}
                              disabled={compilingAll || !projectId}
                              style={{ padding: '7px 14px', border: 0, borderRadius: 6, background: 'var(--accent)', color: '#fff', cursor: compilingAll || !projectId ? 'wait' : 'pointer', fontWeight: 600 }}
                            >
                              {compilingAll
                                ? t('Compiling final PDF…')
                                : compiledPdfUrl
                                  ? t('Recompile final PDF')
                                  : t('Compile final PDF')}
                            </button>
                            {loadingLatestPdf && (
                              <div role="status" style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>
                                {t('Loading previous compiled PDF…')}
                              </div>
                            )}
                            {!loadingLatestPdf && latestPdfChecked && (
                              <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 11 }}>
                                {t('No previous compiled PDF was found. Click Compile final PDF to create one.')}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : previewTab === 'preview' ? (
                        <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                          <div role="note" style={{ padding: '7px 10px', borderBottom: '1px solid #d6b46b', background: '#fffbeb', color: '#604514', fontSize: 11, lineHeight: 1.5, flexShrink: 0 }}>
                            <strong>{t('Quick approximate preview')}</strong> — {t('useful for editing structure, but not the final typeset result. Use Final PDF to verify references, packages, fonts, layout, and figures.')}
                          </div>
                          <div style={{ flex: 1, minHeight: 0 }}>
                            <Suspense fallback={<EditorSurfaceLoader />}>
                              <RenderedPreviewPane
                                content={activeFile.content}
                                filename={activeFile.filename}
                                projectId={projectId}
                                currentFile={activeFile.filename}
                                onScroll={handlePreviewScroll}
                                scrollRatio={previewScrollRatio}
                              />
                            </Suspense>
                          </div>
                        </div>
                      ) : null}
                      
                      {previewTab === 'translate' && (
                        <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--paper)', color: 'var(--text)' }}>
                          <div style={{ minHeight: 36, padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexShrink: 0 }}>
                            <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                              {translating ? t('Translating...') : translationResult ? t('Markdown translation') : t('Click Translate to translate the current document.')}
                            </span>
                            {(translationResult || translationError) && (
                              <button
                                type="button"
                                onClick={() => void handleTranslate(true)}
                                disabled={translating}
                                style={{ padding: '4px 9px', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--paper)', color: 'var(--accent-strong)', cursor: translating ? 'wait' : 'pointer', fontSize: 11 }}
                              >
                                {t('Retranslate')}
                              </button>
                            )}
                          </div>
                          {translationError ? (
                            <div style={{ padding: 14, color: 'var(--danger)', fontSize: 13 }}>{translationError}</div>
                          ) : translationResult ? (
                            <div style={{ flex: 1, minHeight: 0 }}>
                              <Suspense fallback={<EditorSurfaceLoader />}>
                                <RenderedPreviewPane
                                  content={translationResult}
                                  filename="translation.md"
                                  projectId={projectId}
                                  currentFile={activeFile.filename}
                                />
                              </Suspense>
                            </div>
                          ) : translating ? (
                            <div role="status" style={{ padding: 14, color: 'var(--muted)', fontSize: 12 }}>{t('Translating...')}</div>
                          ) : (
                            <div style={{ padding: 14, color: 'var(--muted)', fontSize: 12 }}>{t('Click Translate to translate the current document.')}</div>
                          )}
                        </div>
                      )}
{previewTab === 'diff' && (
                        <div style={{ padding: '12px' }}>
                          {pendingEdits.filter(e => e.status === 'pending').length === 0 ? (
                            <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '24px' }}>
                              {t('No pending edits. Use Agent mode to propose changes.')}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>
                                {t('Diff Preview')} ({pendingEdits.filter(e => e.status === 'pending').length})
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
          <p style={{ margin: 0, fontSize: '13px' }}>{t('Open a file from the project tree')}</p>
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
            border: `1px solid ${compileTone(compileResult)}`,
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
            background: compileBackground(compileResult),
            borderBottom: `1px solid ${compileTone(compileResult)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: compileTone(compileResult) }}>
              {!compileResult.ok || compileResult.status === 'failed'
                ? t('Compile Failed')
                : compileResult.status === 'warning'
                  ? t('Compile Succeeded with Warnings ({{count}})', { count: compileResult.warnings?.length || 0 })
                  : t('Compile Success')}
            </span>
            <button
              onClick={() => setCompileResult(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--muted)' }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
            {compileResult.warnings?.map((warning) => `[${warning.code}] ${warning.message}\n`)}
            {compileResult.errors?.map((error) => `[${error.code}] ${error.message}\n`)}
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
            border: `1px solid ${compileTone(compileAllResult)}`,
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
            background: compileBackground(compileAllResult),
            borderBottom: `1px solid ${compileTone(compileAllResult)}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: compileTone(compileAllResult) }}>
              {!compileAllResult.ok || compileAllResult.status === 'failed'
                ? t('Full Paper Compile Failed')
                : compileAllResult.status === 'warning'
                  ? t('Full Paper Compiled with Warnings ({{count}})', { count: compileAllResult.warnings?.length || 0 })
                  : t('Full Paper Compiled ({{engine}})', { engine: compileAllResult.engine || 'pdflatex' })}
            </span>
            <button
              onClick={() => setCompileAllResult(null)}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--muted)' }}
            >
              ×
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '10px 14px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
            {compileAllResult.warnings?.map((warning) => `[${warning.code}] ${warning.message}\n`)}
            {compileAllResult.errors?.map((error) => `[${error.code}] ${error.message}\n`)}
            {compileAllResult.log || compileAllResult.error}
          </div>
        </div>
      )}
    </div>
  );
}
