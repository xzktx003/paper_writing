import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';

interface Props {
  content: string;
  onChange: (content: string) => void;
  onScroll?: (ratio: number) => void;
  scrollRatio?: number;
}

export interface MarkdownEditorHandle {
  scrollToRatio: (ratio: number) => void;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, Props>(
  ({ content, onChange, onScroll, scrollRatio }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const onChangeRef = useRef(onChange);
    const onScrollRef = useRef(onScroll);
    const scrollingRef = useRef(false);
    onChangeRef.current = onChange;
    onScrollRef.current = onScroll;

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
          syntaxHighlighting(defaultHighlightStyle),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
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
          }),
          EditorView.theme({
            '&': { height: '100%' },
            '.cm-scroller': { overflow: 'auto' },
            '.cm-content': { fontFamily: 'monospace', fontSize: '14px' },
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
