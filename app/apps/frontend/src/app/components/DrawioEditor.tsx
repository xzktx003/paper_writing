import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  content: string;
  onChange: (content: string) => void;
  projectId?: string | null;
  currentFile?: string;
}

const DEFAULT_DRAWIO_EMBED_URL = 'https://embed.diagrams.net/?embed=1&ui=atlas&spin=1&proto=json&ready=message';
export const DRAWIO_READY_TIMEOUT_MS = 6_000;

export function normalizeDrawioEmbedUrl(value: unknown): string {
  try {
    const url = new URL(String(value || DEFAULT_DRAWIO_EMBED_URL));
    if (!['http:', 'https:'].includes(url.protocol)) return DEFAULT_DRAWIO_EMBED_URL;
    return url.toString();
  } catch {
    return DEFAULT_DRAWIO_EMBED_URL;
  }
}

// Default empty diagram XML
const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2024-01-01T00:00:00.000Z" agent="Paper Agent" version="24.0.0">
  <diagram id="diagram1" name="Page-1">
    <mxGraphModel dx="1422" dy="762" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

export function DrawioEditor({ content, onChange, projectId, currentFile }: Props) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'svg' | 'png'>('svg');
  const [drawioEmbedUrl, setDrawioEmbedUrl] = useState(DEFAULT_DRAWIO_EMBED_URL);
  const [reloadKey, setReloadKey] = useState(0);
  const [showSource, setShowSource] = useState(false);

  const xmlContent = content || EMPTY_DIAGRAM;
  const allowedOrigin = useMemo(() => new URL(drawioEmbedUrl).origin, [drawioEmbedUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/config')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Config request failed: ${response.status}`);
        return response.json();
      })
      .then((config) => {
        if (cancelled) return;
        setDrawioEmbedUrl(normalizeDrawioEmbedUrl(config.drawio_embed_url));
      })
      .catch(() => {
        if (!cancelled) setDrawioEmbedUrl(DEFAULT_DRAWIO_EMBED_URL);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setInitialized(false);
    setLoading(true);
    setError(null);
  }, [drawioEmbedUrl, reloadKey]);

  useEffect(() => {
    if (!loading || initialized || showSource) return undefined;
    const timeout = window.setTimeout(() => {
      setLoading(false);
      setError(t('Draw.io editor did not become ready. Check the configured embed service or use the offline XML source.'));
    }, DRAWIO_READY_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [initialized, loading, reloadKey, drawioEmbedUrl, showSource, t]);

  const postToEditor = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(payload), allowedOrigin);
  }, [allowedOrigin]);

  // Handle messages from Draw.io iframe
  const handleMessage = useCallback((event: MessageEvent) => {
    if (event.source !== iframeRef.current?.contentWindow || event.origin !== allowedOrigin) return;

    try {
      const data = JSON.parse(event.data);
      switch (data.event) {
        case 'init':
          // Send the diagram content to the iframe
          if (iframeRef.current) {
            postToEditor({ action: 'load', xml: xmlContent });
            setInitialized(true);
            setLoading(false);
            setError(null);
          }
          break;

        case 'load':
          // Diagram loaded successfully
          setLoading(false);
          setError(null);
          break;

        case 'save':
          // User saved the diagram
          if (data.xml) {
            onChange(data.xml);
          }
          break;

        case 'export':
          // Export completed
          if (data.data) {
            handleExportComplete(data.data, data.format);
          }
          break;

        case 'exit':
          // Editor closed
          break;

        case 'configure':
          // Configure the editor
          postToEditor({
            action: 'configure',
            config: {
              defaultFont: 'Helvetica',
              defaultFontSize: 12,
              colors: ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'],
            },
          });
          break;
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, [allowedOrigin, xmlContent, onChange, postToEditor]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Send content when it changes externally
  useEffect(() => {
    if (initialized && iframeRef.current) {
      postToEditor({ action: 'load', xml: xmlContent });
    }
  }, [initialized, xmlContent, postToEditor]);

  const handleExportComplete = (data: string, format: string) => {
    // Create download link
    const blob = new Blob([data], {
      type: format === 'svg' ? 'image/svg+xml' : 'image/png',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFile?.replace(/\.[^.]+$/, '') || 'diagram'}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerSave = () => {
    if (initialized) postToEditor({ action: 'export', format: 'xmlsvg', spin: true });
  };

  const triggerExport = () => {
    if (initialized) postToEditor({
      action: 'export',
      format: exportFormat,
      spin: true,
      backgroundColor: '#ffffff',
    });
  };

  const fitPage = () => {
    if (initialized) postToEditor({ action: 'layout', layouts: [] });
  };

  const retryEditor = () => {
    setShowSource(false);
    setError(null);
    setInitialized(false);
    setLoading(true);
    setReloadKey((value) => value + 1);
  };

  const downloadXml = () => {
    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = currentFile || 'diagram.drawio';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
      {/* Toolbar */}
      <div
        style={{
          height: '38px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: '6px',
          flexShrink: 0,
          background: 'var(--panel-muted)',
        }}
      >
        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-strong)' }}>
          📊 {currentFile || 'diagram.drawio'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          {loading && (
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{t('Loading editor...')}</span>
          )}
          {error && (
            <span style={{ fontSize: '11px', color: 'var(--danger)' }}>{error}</span>
          )}
          {showSource && <>
            <button className="btn ghost" type="button" aria-label="Download XML" onClick={downloadXml}>{t('Download XML')}</button>
            <button className="btn ghost" type="button" aria-label="Retry Draw.io" onClick={retryEditor}>{t('Retry Draw.io')}</button>
          </>}
          <button
            onClick={fitPage}
            disabled={!initialized}
            title="Fit to page"
            style={{
              fontSize: '11px', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '3px 8px', cursor: 'pointer', background: 'transparent',
              color: 'var(--text-secondary)', fontWeight: 500,
            }}
          >
            Fit
          </button>
          <select
            value={exportFormat}
            onChange={e => setExportFormat(e.target.value as 'svg' | 'png')}
            style={{
              fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px',
              padding: '2px 4px', background: 'var(--paper)', color: 'var(--text)',
              cursor: 'pointer',
            }}
          >
            <option value="svg">SVG</option>
            <option value="png">PNG</option>
          </select>
          <button
            onClick={triggerExport}
            disabled={!initialized}
            title="Export diagram"
            style={{
              fontSize: '11px', border: '1px solid var(--border)', borderRadius: '6px',
              padding: '3px 8px', cursor: 'pointer', background: 'transparent',
              color: 'var(--text-secondary)', fontWeight: 500,
            }}
          >
            Export
          </button>
          <button
            onClick={triggerSave}
            disabled={!initialized}
            title="Save diagram (Ctrl+S)"
            style={{
              fontSize: '11px', border: '1px solid var(--accent)', borderRadius: '6px',
              padding: '3px 10px', cursor: 'pointer', background: 'var(--accent-soft)',
              color: 'var(--accent-strong)', fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Draw.io iframe */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {showSource ? (
          <textarea
            aria-label="Draw.io XML source"
            value={xmlContent}
            onChange={(event) => onChange(event.target.value)}
            spellCheck={false}
            style={{ width: '100%', height: '100%', resize: 'none', border: 0, padding: 16, fontFamily: 'SFMono-Regular, Consolas, monospace', fontSize: 12, background: 'var(--paper)', color: 'var(--text)' }}
          />
        ) : loading && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: '32px', opacity: 0.4 }}>📊</div>
            <p style={{ margin: 0, fontSize: '13px' }}>{t('Loading Draw.io editor...')}</p>
            <p style={{ margin: 0, fontSize: '11px', opacity: 0.6 }}>{t('First load may take a few seconds')}</p>
          </div>
        )}
        {!showSource && error && !loading && (
          <div role="alert" style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'grid', placeItems: 'center', padding: 24, background: 'var(--paper)' }}>
            <div style={{ maxWidth: 620, display: 'grid', gap: 12, textAlign: 'center' }}>
              <strong>{t('Draw.io editor unavailable')}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{error}</span>
              <span style={{ color: 'var(--muted)', fontSize: 11 }}>{t('The external editor may receive diagram content. Configure a trusted self-hosted embed URL for restricted environments.')}</span>
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 8 }}>
                <button className="btn ghost" type="button" aria-label="Retry Draw.io" onClick={retryEditor}>{t('Retry Draw.io')}</button>
                <button className="btn ghost" type="button" aria-label="Edit XML source" onClick={() => setShowSource(true)}>{t('Edit XML source')}</button>
                <button className="btn ghost" type="button" aria-label="Download XML" onClick={downloadXml}>{t('Download XML')}</button>
              </div>
            </div>
          </div>
        )}
        {!showSource && <iframe
          key={`${drawioEmbedUrl}:${reloadKey}`}
          ref={iframeRef}
          src={drawioEmbedUrl}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Draw.io Editor"
          onError={() => {
            setLoading(false);
            setError(t('Draw.io editor failed to load.'));
          }}
        />}
      </div>
    </div>
  );
}
