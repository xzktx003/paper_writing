import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Props {
  content: string;
  onChange: (content: string) => void;
  projectId?: string | null;
  currentFile?: string;
}

const DRAWIO_EMBED_URL = 'https://embed.diagrams.net/?embed=1&ui=atlas&spin=1&proto=json&ready=message';

// Default empty diagram XML
const EMPTY_DIAGRAM = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="2024-01-01T00:00:00.000Z" agent="OpenPrism" version="24.0.0">
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'svg' | 'png'>('svg');

  const xmlContent = content || EMPTY_DIAGRAM;

  // Handle messages from Draw.io iframe
  const handleMessage = useCallback((event: MessageEvent) => {
    // Only accept messages from diagrams.net
    if (!event.origin.includes('diagrams.net') && !event.origin.includes('draw.io')) return;

    try {
      const data = JSON.parse(event.data);
      switch (data.event) {
        case 'init':
          // Send the diagram content to the iframe
          if (iframeRef.current) {
            iframeRef.current.contentWindow?.postMessage(
              JSON.stringify({ action: 'load', xml: xmlContent }),
              '*'
            );
            setInitialized(true);
            setLoading(false);
          }
          break;

        case 'load':
          // Diagram loaded successfully
          setLoading(false);
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
          if (iframeRef.current) {
            iframeRef.current.contentWindow?.postMessage(
              JSON.stringify({
                action: 'configure',
                config: {
                  defaultFont: 'Helvetica',
                  defaultFontSize: 12,
                  colors: ['#000000', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'],
                },
              }),
              '*'
            );
          }
          break;
      }
    } catch {
      // Ignore non-JSON messages
    }
  }, [xmlContent, onChange]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Send content when it changes externally
  useEffect(() => {
    if (initialized && iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ action: 'load', xml: xmlContent }),
        '*'
      );
    }
  }, [initialized, xmlContent]);

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
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ action: 'export', format: 'xmlsvg', spin: true }),
        '*'
      );
    }
  };

  const triggerExport = () => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({
          action: 'export',
          format: exportFormat,
          spin: true,
          backgroundColor: '#ffffff',
        }),
        '*'
      );
    }
  };

  const fitPage = () => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(
        JSON.stringify({ action: 'layout', layouts: [] }),
        '*'
      );
    }
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
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Loading editor...</span>
          )}
          {error && (
            <span style={{ fontSize: '11px', color: 'var(--danger)' }}>{error}</span>
          )}
          <button
            onClick={fitPage}
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
        {loading && (
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
            <p style={{ margin: 0, fontSize: '13px' }}>Loading Draw.io editor...</p>
            <p style={{ margin: 0, fontSize: '11px', opacity: 0.6 }}>First load may take a few seconds</p>
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={DRAWIO_EMBED_URL}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
          }}
          title="Draw.io Editor"
          onLoad={() => {
            // The iframe will send 'init' event when ready
          }}
        />
      </div>
    </div>
  );
}
