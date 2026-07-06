import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState, StateField, StateEffect } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { autocompletion, completionKeymap, CompletionContext } from '@codemirror/autocomplete';
import { latexCompletions, bibtexCompletion } from './latexCompletions';

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  toDOM() {
    const span = document.createElement('span');
    span.textContent = this.text;
    span.style.opacity = '0.4';
    span.style.fontStyle = 'italic';
    span.className = 'cm-ghost-text';
    return span;
  }
}

const setGhostText = StateEffect.define<{ pos: number; text: string } | null>();

const ghostTextField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setGhostText)) {
        if (!e.value) return Decoration.none;
        const widget = Decoration.widget({ widget: new GhostTextWidget(e.value.text), side: 1 });
        return Decoration.set([widget.range(e.value.pos)]);
      }
    }
    if (tr.docChanged) return Decoration.none;
    return value;
  },
  provide: f => EditorView.decorations.from(f),
});

let pendingGhostText: string | null = null;
let completionAbortController: AbortController | null = null;
let completionDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 300;

function triggerAICompletion(view: EditorView): boolean {
  const cursor = view.state.selection.main.head;
  const doc = view.state.doc.toString();
  const textBefore = doc.slice(0, cursor);
  const textAfter = doc.slice(cursor);

  if (!textBefore.trim()) return true;

  if (completionAbortController) {
    completionAbortController.abort();
    completionAbortController = null;
  }
  if (completionDebounceTimer) {
    clearTimeout(completionDebounceTimer);
  }

  completionDebounceTimer = setTimeout(() => {
    const controller = new AbortController();
    completionAbortController = controller;

    view.dispatch({ effects: setGhostText.of({ pos: cursor, text: '...' }) });

    fetch('/api/ai/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ textBefore, textAfter }),
      signal: controller.signal,
    })
      .then(res => res.json())
      .then(data => {
        if (controller.signal.aborted) return;
        if (data.ok && data.completion) {
          const currentCursor = view.state.selection.main.head;
          if (currentCursor === cursor) {
            pendingGhostText = data.completion;
            view.dispatch({ effects: setGhostText.of({ pos: cursor, text: data.completion }) });
          } else {
            view.dispatch({ effects: setGhostText.of(null) });
          }
        } else {
          view.dispatch({ effects: setGhostText.of(null) });
        }
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        view.dispatch({ effects: setGhostText.of(null) });
      })
      .finally(() => {
        if (completionAbortController === controller) {
          completionAbortController = null;
        }
      });
  }, DEBOUNCE_MS);

  return true;
}

function acceptGhostText(view: EditorView): boolean {
  if (!pendingGhostText) return false;
  const cursor = view.state.selection.main.head;
  view.dispatch({
    changes: { from: cursor, insert: pendingGhostText },
    effects: setGhostText.of(null),
  });
  pendingGhostText = null;
  return true;
}

function dismissGhostText(view: EditorView): boolean {
  if (!pendingGhostText) return false;
  if (completionAbortController) {
    completionAbortController.abort();
    completionAbortController = null;
  }
  view.dispatch({ effects: setGhostText.of(null) });
  pendingGhostText = null;
  return true;
}

const aiCompletionKeymap = keymap.of([
  { key: 'Alt-/', run: triggerAICompletion },
  { key: 'Ctrl-Space', run: triggerAICompletion },
  { key: 'Tab', run: acceptGhostText },
  { key: 'Escape', run: dismissGhostText },
]);

interface Props {
  content: string;
  onChange: (content: string) => void;
  onScroll?: (ratio: number) => void;
  scrollRatio?: number;
  onLineClick?: (line: number) => void;
}

export interface MarkdownEditorHandle {
  scrollToRatio: (ratio: number) => void;
  insertText: (text: string) => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  ({ content, onChange, onScroll, scrollRatio, onLineClick }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onScrollRef = useRef(onScroll);
    const onLineClickRef = useRef(onLineClick);
    const scrollingRef = useRef(false);
    onChangeRef.current = onChange;
    onScrollRef.current = onScroll;
    onLineClickRef.current = onLineClick;

    useImperativeHandle(ref, () => ({
      scrollToRatio: (ratio: number) => {
        const view = viewRef.current;
        if (!view) return;
        const scroller = view.scrollDOM;
        scrollingRef.current = true;
        const maxScroll = scroller.scrollHeight - scroller.clientHeight;
        scroller.scrollTop = ratio * maxScroll;
        requestAnimationFrame(() => { scrollingRef.current = false; });
      },
      insertText: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const cursor = view.state.selection.main.head;
        view.dispatch({ changes: { from: cursor, insert: text } });
      },
    }));

    useEffect(() => {
      const handler = (e: Event) => {
        const view = viewRef.current;
        if (!view) return;
        const text = (e as CustomEvent).detail;
        if (typeof text === 'string') {
          const cursor = view.state.selection.main.head;
          view.dispatch({ changes: { from: cursor, insert: text } });
        }
      };
      window.addEventListener('editor-insert-text', handler);
      return () => window.removeEventListener('editor-insert-text', handler);
    }, []);

    useEffect(() => {
      if (!containerRef.current) return;

      const state = EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          foldGutter(),
          syntaxHighlighting(defaultHighlightStyle),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          autocompletion({
            override: [
              bibtexCompletion,
              (context: CompletionContext) => {
                const word = context.matchBefore(/\\[a-zA-Z]+/);
                if (word) {
                  const typed = word.text.slice(1);
                  const matches = latexCompletions.filter(c =>
                    c.label.toLowerCase().startsWith(typed.toLowerCase())
                  ).slice(0, 10);
                  if (matches.length > 0) {
                    return { from: word.from, options: matches };
                  }
                }
                return null;
              },
            ],
          }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap, ...completionKeymap]),
          aiCompletionKeymap,
          ghostTextField,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            scroll: () => {
              if (scrollingRef.current) return;
              const view = viewRef.current;
              if (!view || !onScrollRef.current) return;
              const scroller = view.scrollDOM;
              const maxScroll = scroller.scrollHeight - scroller.clientHeight;
              if (maxScroll <= 0) return;
              onScrollRef.current(scroller.scrollTop / maxScroll);
            },
            click: (event, view) => {
              const target = event.target as HTMLElement;
              if (target.closest('.cm-lineNumbers') && onLineClickRef.current) {
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
                if (pos !== null) {
                  const line = view.state.doc.lineAt(pos).number;
                  onLineClickRef.current(line);
                }
              }
            },
          }),
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
            '.cm-content': {
              fontFamily: '"Times New Roman", Times, "Songti SC", SimSun, serif',
              fontSize: '14px',
            },
            '.cm-foldGutter': { width: '16px' },
            '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px' },
          }),
        ],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;

      return () => {
        if (completionAbortController) {
          completionAbortController.abort();
          completionAbortController = null;
        }
        if (completionDebounceTimer) {
          clearTimeout(completionDebounceTimer);
          completionDebounceTimer = null;
        }
        view.destroy();
      };
    }, []);

    useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const currentContent = view.state.doc.toString();
      if (currentContent !== content) {
        view.dispatch({
          changes: { from: 0, to: currentContent.length, insert: content },
        });
      }
    }, [content]);

    useEffect(() => {
      if (scrollRatio === undefined) return;
      const view = viewRef.current;
      if (!view) return;
      scrollingRef.current = true;
      const scroller = view.scrollDOM;
      const maxScroll = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = scrollRatio * maxScroll;
      requestAnimationFrame(() => { scrollingRef.current = false; });
    }, [scrollRatio]);

    return <div ref={containerRef} style={{ height: '100%' }} />;
  }
);

MarkdownEditor.displayName = 'MarkdownEditor';
