import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  readProjectBibliography,
  readProjectTexContent,
  registerCitationVerificationRoutes,
} from '../apps/backend/src/routes/citationVerification.js';
import { extractCiteKeys, verifyBibFile } from '../apps/backend/src/services/citationVerificationService.js';

describe('Citation verification routes', () => {
  let app;
  let projectPath;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), 'citation-verification-'));
    await mkdir(join(projectPath, 'sec', 'nested'), { recursive: true });
    await mkdir(join(projectPath, 'bibliography'), { recursive: true });
    await writeFile(join(projectPath, 'main.tex'), String.raw`
\documentclass{article}
\cite{root-ref}
\input{sec/1.introduction}
% \input{ignored}
\bibliography{bibliography/library}
\begin{document}\end{document}
`);
    await writeFile(join(projectPath, 'sec', '1.introduction.tex'), String.raw`
\citet[see][p.~2]{intro-ref}
\include{nested/details}
`);
    await writeFile(join(projectPath, 'sec', 'nested', 'details.tex'), String.raw`
\autocite{detail-ref}
\input{../../main}
`);
    await writeFile(join(projectPath, 'bibliography', 'library.bib'), `
@article{root-ref, title={Root}}
@article{intro-ref, title={Intro}}
@article{detail-ref, title={Detail}}
@article{unused-ref, title={Unused}}
`);

    app = Fastify({ logger: false });
    registerCitationVerificationRoutes(app, {
      resolveProjectRoot: async projectId => {
        if (projectId === 'managed-test-project') return projectPath;
        throw new Error(`Unknown test project: ${projectId}`);
      },
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await rm(projectPath, { recursive: true, force: true });
  });

  it('recursively reads input/include files once and ignores commented includes', async () => {
    const content = await readProjectTexContent(projectPath);

    expect(content).toContain('root-ref');
    expect(content).toContain('intro-ref');
    expect(content).toContain('detail-ref');
    expect(content.match(/\\documentclass/g)).toHaveLength(1);
    expect(content).not.toContain('ignored.tex');
  });

  it('cross-checks citations across the complete TeX project', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/citations/cross-check',
      payload: { projectId: 'managed-test-project' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBeUndefined();
    expect(response.json()).toMatchObject({
      citedKeys: ['root-ref', 'intro-ref', 'detail-ref'],
      missingInBib: [],
      uncitedInBib: ['unused-ref'],
      bibFiles: ['bibliography/library.bib'],
      mainFile: 'main.tex',
    });
  });

  it('resolves Paper Agent project markers before reading bibliography files', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/citations/cross-check',
      payload: { projectPath: '__paper_agent__:managed-test-project' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBe('true');
    expect(response.json()).toMatchObject({
      citedKeys: ['root-ref', 'intro-ref', 'detail-ref'],
      missingInBib: [],
      uncitedInBib: ['unused-ref'],
      bibFiles: ['bibliography/library.bib'],
      mainFile: 'main.tex',
    });
  });

  it('uses projectId as the primary managed-project contract', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/citations/cross-check',
      payload: { projectId: 'managed-test-project' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers.deprecation).toBeUndefined();
    expect(response.json()).toMatchObject({
      citedKeys: ['root-ref', 'intro-ref', 'detail-ref'],
      missingInBib: [],
    });
  });

  it('supports addbibresource declarations with options', async () => {
    await writeFile(join(projectPath, 'main.tex'), String.raw`
\documentclass{article}
\addbibresource[location=local]{bibliography/library.bib}
\begin{document}\autocite{root-ref}\end{document}
`);

    const bibliography = await readProjectBibliography(projectPath);
    expect(bibliography.bibFiles).toEqual(['bibliography/library.bib']);
    expect(bibliography.mainFile).toBe('main.tex');
    expect(bibliography.content).toContain('@article{root-ref');
  });

  it('rejects TeX entry paths outside the project', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/citations/cross-check',
      payload: { projectId: 'managed-test-project', texFile: '../outside.tex' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/inside the project/);
  });
});

describe('extractCiteKeys', () => {
  it('supports common natbib and biblatex commands with optional arguments', () => {
    const content = String.raw`
\cite{a,b}
\citet[see][p.~4]{c}
\citeauthor*{d}
\autocite{e}
\parencite[chap.~2]{f}
% \cite{commented-out}
`;

    expect(extractCiteKeys(content)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});

describe('verifyBibFile batching', () => {
  it('honors bounded concurrency and reports batch progress', async () => {
    const bibContent = Array.from({ length: 7 }, (_, index) => `@article{ref-${index}, title={Title ${index}}}`).join('\n');
    let active = 0;
    let maxActive = 0;
    const progress = [];

    const report = await verifyBibFile(bibContent, {
      concurrency: 3,
      entryTimeoutMs: 5000,
      onProgress: state => progress.push(state.done),
      verifyEntry: async entry => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise(resolve => setTimeout(resolve, 10));
        active -= 1;
        return {
          key: entry.key,
          type: entry.type,
          doi: null,
          title: entry.fields.title,
          status: 'title_match',
          confidence: 'medium',
          sources: [],
        };
      },
    });

    expect(maxActive).toBe(3);
    expect(progress).toEqual([3, 6, 7]);
    expect(report.totalEntries).toBe(7);
    expect(report.titleMatch).toBe(7);
  });
});
