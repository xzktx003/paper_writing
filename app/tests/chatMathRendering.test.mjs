import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatView } from '../apps/frontend/src/app/components/ChatView.tsx';

describe('chat Markdown math rendering', () => {
  it('renders inline and display formulas in completed messages without enabling raw HTML', () => {
    const html = renderToStaticMarkup(React.createElement(ChatView, {
      messages: [{
        role: 'assistant',
        content: 'Inline $E=mc^2$ and display:\n\n$$\n\\int_0^1 x^2\\,dx = \\frac{1}{3}\n$$\n\n<script>alert(1)</script>',
      }],
      loading: false,
    }));

    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
    expect(html).toContain('chat-markdown-body');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders formulas while an assistant response is streaming', () => {
    const html = renderToStaticMarkup(React.createElement(ChatView, {
      messages: [],
      loading: true,
      streamingText: '当前结果为 $\\mathbf{y}=W\\mathbf{x}$.',
    }));

    expect(html).toContain('class="katex"');
    expect(html).toContain('streaming-cursor');
  });
});
