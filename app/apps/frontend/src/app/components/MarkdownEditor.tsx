import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, foldGutter, foldKeymap } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { autocompletion, completionKeymap, CompletionContext } from '@codemirror/autocomplete';
import { latexCompletions, bibtexCompletion } from './latexCompletions';

interface Props {
  content: string;
  onChange: (content: string) => void;
  onScroll?: (ratio: number) => void;
  scrollRatio?: number;
  onLineClick?: (line: number) => void;
}

export interface MarkdownEditorHandle {
  scrollToRatio: (ratio: number) => void;
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
    }));

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
              // BibTeX citation search (@)
              bibtexCompletion,
              // LaTeX command completion (\)
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
              // SyncTeX: handle line number gutter clicks
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
            '.cm-content': { fontFamily: 'monospace', fontSize: '14px' },
            '.cm-foldGutter': { width: '16px' },
            '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px' },
          }),
        ],
      });

      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;

      return () => { view.destroy(); };
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
