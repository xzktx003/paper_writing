import React, { lazy, Suspense } from 'react';

const MarkdownPreview = lazy(() => import('./MarkdownPreview').then((module) => ({ default: module.MarkdownPreview })));
const LatexPreview = lazy(() => import('./LatexPreview').then((module) => ({ default: module.LatexPreview })));

function PreviewLoader() {
  return <div role="status" style={{ padding: 16, color: 'var(--muted)', fontSize: 12 }}>Loading preview…</div>;
}

interface Props {
  content: string;
  filename: string;
  projectId?: string | null;
  currentFile?: string;
  onScroll?: (ratio: number) => void;
  scrollRatio?: number;
}

export function RenderedPreviewPane({ content, filename, projectId, currentFile = filename, onScroll, scrollRatio }: Props) {
  if (filename.endsWith('.tex')) {
    return (
      <Suspense fallback={<PreviewLoader />}>
        <LatexPreview
          content={content}
          projectId={projectId}
          currentFile={currentFile}
          onScroll={onScroll}
          scrollRatio={scrollRatio}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PreviewLoader />}>
      <MarkdownPreview
        content={content}
        projectId={projectId}
        currentFile={currentFile}
        onScroll={onScroll}
        scrollRatio={scrollRatio}
      />
    </Suspense>
  );
}
