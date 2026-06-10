/**
 * Custom features injected without modifying the main bundle.
 * Loaded after the React app mounts. Uses MutationObserver to
 * hook into dynamically rendered elements.
 */
(function () {
  'use strict';

  // ---- Helpers ----
  var PROJECT_ID_RE = /\/editor\/([^/]+)/;
  function getProjectId() {
    var m = location.pathname.match(PROJECT_ID_RE);
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ==================================================================
  // 1. Terminal wheel scroll fix
  // ==================================================================
  //
  // ROOT CAUSE: xterm.js 5.3.0's bindMouse() registers a wheel listener
  // (bubbling phase) on .xterm when mouse tracking protocol has bit 16 set
  // (ANY_EVENT / \e[?1003h). That handler calls cancel(ev, true) which
  // calls preventDefault() + stopPropagation(), blocking native viewport
  // scrolling.
  //
  // FIX v2: Register a CAPTURE-phase wheel listener on each .xterm element.
  // In the capture handler we directly adjust viewport.scrollTop and call
  // stopPropagation() — this prevents the event from EVER reaching the
  // bubbling phase where xterm's handler would fire.  (stopImmediatePropagation
  // does NOT work here because it only blocks same-phase handlers.)
  //
  // As a bonus, try to find the Terminal instance and use its
  // scrollLines() API for even more reliable scrolling.
  // ==================================================================

  var terminalScrollPatched = new WeakSet();

  /**
   * Try to find the xterm.js Terminal instance from a .xterm DOM element.
   * xterm.js v5 doesn't store it on the DOM element directly, but we
   * can sometimes find it via internal properties or monkey-patching.
   */
  function findTerminalInstance(xtermEl) {
    // Check common internal property names
    var keys = ['__xterm', '_xterm', '_terminal', '__terminal', 'terminal'];
    for (var i = 0; i < keys.length; i++) {
      var v = xtermEl[keys[i]];
      if (v && typeof v.scrollLines === 'function') return v;
    }
    // Check all enumerable properties
    for (var k in xtermEl) {
      if (xtermEl.hasOwnProperty(k)) {
        try {
          var val = xtermEl[k];
          if (val && typeof val.scrollLines === 'function') return val;
        } catch (e) {}
      }
    }
    return null;
  }

  function patchTerminalScroll(xtermEl) {
    if (terminalScrollPatched.has(xtermEl)) return;
    terminalScrollPatched.add(xtermEl);

    // CRITICAL: Use CAPTURE phase (true) so our handler fires BEFORE
    // xterm's bubbling-phase handler.  Then stopPropagation() prevents
    // the event from ever reaching xterm's handler.
    xtermEl.addEventListener('wheel', function (ev) {
      // Re-query viewport each time — the DOM can change
      var viewport = xtermEl.querySelector('.xterm-viewport');
      if (!viewport) return;

      var scrollArea = xtermEl.querySelector('.xterm-scroll-area');

      // Measure actual row height
      var lineHeight = 18;
      var rowEl = xtermEl.querySelector('.xterm-rows > div');
      if (rowEl) {
        var rh = rowEl.getBoundingClientRect().height;
        if (rh > 0) lineHeight = rh;
      }

      // Ensure scroll area has enough height
      var maxScroll = viewport.scrollHeight - viewport.clientHeight;
      if (maxScroll <= 0 && scrollArea) {
        var rows = 24;
        var termRows = xtermEl.querySelector('.xterm-rows');
        if (termRows) rows = termRows.children.length || 24;
        scrollArea.style.height = ((rows + 1000) * lineHeight) + 'px';
        // Give the browser a frame to update layout
        requestAnimationFrame(function () {
          // Recalculate after layout
        });
      }

      maxScroll = viewport.scrollHeight - viewport.clientHeight;
      if (maxScroll <= 0) {
        // Still no scroll room — but don't lose the event.
        // Flag the scroll area to be re-synced.
        if (scrollArea) scrollArea.style.height = '99999px';
        maxScroll = viewport.scrollHeight - viewport.clientHeight;
        if (maxScroll <= 0) {
          // Nothing we can do, let the event pass
          return;
        }
      }

      // Calculate scroll delta in pixels
      var delta = ev.deltaY;
      if (ev.deltaMode === 1) {
        // Line mode
        delta = ev.deltaY * lineHeight * 3;
      } else if (ev.deltaMode === 2) {
        // Page mode
        delta = ev.deltaY * viewport.clientHeight;
      }

      // Apply scroll
      var oldTop = viewport.scrollTop;
      viewport.scrollTop = Math.max(0, Math.min(maxScroll, oldTop + delta));

      // stopPropagation → prevents event from reaching bubbling phase
      // where xterm's bindMouse handler would fire
      ev.stopPropagation();
      ev.preventDefault();

      // The browser fires a native 'scroll' event on the viewport element
      // when scrollTop changes.  xterm.js listens to that scroll event via
      // _handleScroll → _onRequestScrollLines → scrollLines → buffer.ydisp
      // → renderer redraws.
    }, true); // CAPTURE phase

    console.log('[custom-features] Terminal wheel scroll patched');
  }

  function scanForTerminals(root) {
    if (!root || !root.querySelectorAll) return;
    var xtermEls = root.querySelectorAll('.xterm');
    for (var i = 0; i < xtermEls.length; i++) {
      patchTerminalScroll(xtermEls[i]);
    }
    if (root.classList && root.classList.contains('xterm')) {
      patchTerminalScroll(root);
    }
  }

  // ==================================================================
  // 2. Auto-dismiss compile error / toast after 10 s
  // ==================================================================
  var DISMISS_MS = 10000;
  var seenErrors = new WeakSet();

  function scanForErrors(root) {
    if (!root || !root.querySelectorAll) return;
    var candidates = root.querySelectorAll(
      '[class*="error"], [class*="Error"], [class*="toast"], [class*="Toast"], [class*="alert"], [class*="Alert"], [class*="danger"], [class*="Danger"]'
    );
    candidates.forEach(function (el) {
      if (seenErrors.has(el)) return;
      var text = (el.textContent || '').toLowerCase();
      if (
        text.indexOf('error') >= 0 ||
        text.indexOf('failed') >= 0 ||
        text.indexOf('\u9519\u8bef') >= 0 ||
        text.indexOf('\u5931\u8d25') >= 0 ||
        text.indexOf('misplaced') >= 0 ||
        text.indexOf('halted') >= 0
      ) {
        seenErrors.add(el);
        setTimeout(function () {
          el.style.transition = 'opacity 0.4s';
          el.style.opacity = '0';
          setTimeout(function () { el.remove(); }, 400);
        }, DISMISS_MS);
      }
    });
  }

  // ==================================================================
  // 3. SyncTeX click-to-source on PDF embeds
  // ==================================================================
  var synctexOverlays = new WeakSet();

  function addSynctexOverlay(embedEl) {
    if (synctexOverlays.has(embedEl)) return;
    synctexOverlays.add(embedEl);

    var parent = embedEl.parentElement;
    if (!parent) return;

    var prevPos = getComputedStyle(parent).position;
    if (prevPos === 'static') parent.style.position = 'relative';

    var overlay = document.createElement('div');
    overlay.title = 'Click to jump to source (SyncTeX)';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.cursor = 'crosshair';
    overlay.style.zIndex = '5';
    overlay.style.background = 'transparent';

    overlay.addEventListener('click', function (e) {
      var rect = overlay.getBoundingClientRect();
      var relX = e.clientX - rect.left;
      var relY = e.clientY - rect.top;
      var pdfX = relX / rect.width * 612;
      var pdfY = (1 - relY / rect.height) * 792;

      var projectId = getProjectId();
      if (!projectId) return;

      fetch(
        '/api/projects/' + encodeURIComponent(projectId) + '/synctex/pdf-to-source',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: 1, x: pdfX, y: pdfY }),
        }
      )
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.ok && data.file && data.line) {
            window.dispatchEvent(
              new CustomEvent('synctex-jump', {
                detail: { file: data.file, line: data.line },
              })
            );
          }
        })
        .catch(function () {});
    });

    parent.appendChild(overlay);
  }

  window.addEventListener('synctex-jump', function (e) {
    var detail = e.detail || {};
    if (!detail.file || !detail.line) return;

    var cmEl = document.querySelector('.cm-editor');
    if (cmEl && cmEl.cmView && cmEl.cmView.view) {
      var view = cmEl.cmView.view;
      var doc = view.state.doc;
      var targetLine = Math.min(detail.line, doc.lines);
      var lineObj = doc.line(targetLine);
      view.dispatch({ selection: { anchor: lineObj.from } });
      view.focus();
    }
  });

  function scanForPdfEmbeds(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('embed[type="application/pdf"]').forEach(addSynctexOverlay);
    root.querySelectorAll('iframe').forEach(function (iframe) {
      var src = iframe.src || '';
      if (src.indexOf('.pdf') >= 0 || src.indexOf('/blob') >= 0) {
        addSynctexOverlay(iframe);
      }
    });
  }

  // ==================================================================
  // MutationObserver — watch the whole document
  // ==================================================================
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var addedNodes = mutations[i].addedNodes;
      for (var j = 0; j < addedNodes.length; j++) {
        var node = addedNodes[j];
        if (node.nodeType !== 1) continue;
        scanForErrors(node);
        scanForPdfEmbeds(node);
        scanForTerminals(node);
      }
    }
  });

  function init() {
    scanForErrors(document);
    scanForPdfEmbeds(document);
    scanForTerminals(document);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
    console.log('[custom-features] Loaded v2: terminal scroll (capture+stopPropagation), synctex, error-dismiss');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 1000);
  }
})();
