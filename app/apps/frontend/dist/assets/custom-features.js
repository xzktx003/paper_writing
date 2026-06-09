/**
 * Custom features injected without modifying the main bundle.
 * Loaded after the React app mounts. Uses MutationObserver to
 * hook into dynamically rendered elements.
 */
(function () {
  'use strict';

  // ---- Helpers ----
  const PROJECT_ID_RE = /\/editor\/([^/]+)/;
  function getProjectId() {
    const m = location.pathname.match(PROJECT_ID_RE);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ---- 1. Auto-dismiss compile error / toast after 10 s ----
  const DISMISS_MS = 10000;
  const seenErrors = new WeakSet();

  function scanForErrors(root) {
    // Look for elements that look like error banners
    const candidates = root.querySelectorAll(
      '[class*="error"], [class*="Error"], [class*="toast"], [class*="Toast"], [class*="alert"], [class*="Alert"], [class*="danger"], [class*="Danger"]'
    );
    candidates.forEach((el) => {
      if (seenErrors.has(el)) return;
      const text = (el.textContent || '').toLowerCase();
      if (
        text.includes('error') ||
        text.includes('failed') ||
        text.includes('错误') ||
        text.includes('失败') ||
        text.includes('misplaced') ||
        text.includes('halted')
      ) {
        seenErrors.add(el);
        setTimeout(() => {
          el.style.transition = 'opacity 0.4s';
          el.style.opacity = '0';
          setTimeout(() => el.remove(), 400);
        }, DISMISS_MS);
      }
    });
  }

  // ---- 2. SyncTeX click-to-source on PDF <embed> / <iframe> ----
  const synctexOverlays = new WeakSet();

  function addSynctexOverlay(embedEl) {
    if (synctexOverlays.has(embedEl)) return;
    synctexOverlays.add(embedEl);

    const parent = embedEl.parentElement;
    if (!parent) return;

    // Make parent relative if needed
    const prevPos = getComputedStyle(parent).position;
    if (prevPos === 'static') parent.style.position = 'relative';

    const overlay = document.createElement('div');
    overlay.title = 'Click to jump to source (SyncTeX)';
    Object.assign(overlay.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      cursor: 'crosshair',
      zIndex: '5',
      background: 'transparent',
    });

    overlay.addEventListener('click', async (e) => {
      const rect = overlay.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const relY = e.clientY - rect.top;
      const normX = relX / rect.width;
      const normY = relY / rect.height;
      // Convert to PDF points (letter size 612×792)
      const pdfX = normX * 612;
      const pdfY = (1 - normY) * 792;

      const projectId = getProjectId();
      if (!projectId) return;

      try {
        const resp = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/synctex/pdf-to-source`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: 1, x: pdfX, y: pdfY }),
          }
        );
        const data = await resp.json();
        if (data.ok && data.file && data.line) {
          window.dispatchEvent(
            new CustomEvent('synctex-jump', {
              detail: { file: data.file, line: data.line },
            })
          );
        }
      } catch (_) {
        // silently ignore
      }
    });

    parent.appendChild(overlay);
  }

  // ---- 3. Handle synctex-jump → scroll CodeMirror editor ----
  window.addEventListener('synctex-jump', (e) => {
    const { file, line } = e.detail || {};
    if (!file || !line) return;

    // Try to find the CodeMirror editor instance
    const cmEl = document.querySelector('.cm-editor');
    if (cmEl && cmEl.cmView?.view) {
      const view = cmEl.cmView.view;
      // Find the line in the document
      const doc = view.state.doc;
      const targetLine = Math.min(line, doc.lines);
      const lineObj = doc.line(targetLine);
      view.dispatch({
        selection: { anchor: lineObj.from },
        effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
      });
      view.focus();
      return;
    }

    // Fallback: try textarea
    const ta = document.querySelector('.cm-content, textarea.cm-content, .CodeMirror-code');
    if (ta) {
      ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // ---- 4. Scan for PDF embeds to add synctex overlay ----
  function scanForPdfEmbeds(root) {
    // Match <embed type="application/pdf"> and <iframe> that loads a PDF
    root.querySelectorAll('embed[type="application/pdf"]').forEach(addSynctexOverlay);
    root.querySelectorAll('iframe').forEach((iframe) => {
      const src = iframe.src || '';
      if (src.includes('.pdf') || src.includes('/blob')) {
        addSynctexOverlay(iframe);
      }
    });
  }

  // ---- MutationObserver: watch the whole document ----
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        scanForErrors(node);
        scanForPdfEmbeds(node);
        // Also check children
        if (node.querySelectorAll) {
          scanForErrors(node);
          scanForPdfEmbeds(node);
        }
      }
    }
  });

  // Start observing once DOM is ready
  function init() {
    scanForErrors(document);
    scanForPdfEmbeds(document);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    console.log('[custom-features] Loaded: synctex overlay, error auto-dismiss');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Delay slightly to let React mount
    setTimeout(init, 1000);
  }
})();
