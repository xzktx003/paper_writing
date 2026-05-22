import React, { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { resolveProjectAssetUrl } from '../utils/previewAssets';

interface Props {
  content: string;
  projectId?: string | null;
  currentFile?: string;
  onScroll?: (ratio: number) => void;
  scrollRatio?: number;
}

export function MarkdownPreview({ content, projectId, currentFile = '', onScroll, scrollRatio }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || scrollRatio === undefined) return;
    scrollingRef.current = true;
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = scrollRatio * maxScroll;
    requestAnimationFrame(() => { scrollingRef.current = false; });
  }, [scrollRatio]);

  const handleScroll = () => {
    if (scrollingRef.current || !onScroll) return;
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= 0) return;
    onScroll(el.scrollTop / maxScroll);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{ padding: '16px 24px', overflow: 'auto', height: '100%', fontFamily: 'serif', lineHeight: 1.8 }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt, ...props }) => (
            <img
              {...props}
              src={resolveProjectAssetUrl(projectId, currentFile, src)}
              alt={alt || ''}
              loading="lazy"
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
