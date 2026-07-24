import { describe, expect, it } from 'vitest';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  detectTemplateMainFile,
  installTemplateFromStaging,
  readTemplateManifest,
  resolveTemplateSelection,
  validateTemplateCatalog,
  validateTemplateId,
} from '../apps/backend/src/services/templateService.js';

describe('template contract', () => {
  it('only exposes manifest templates whose declared main file exists', async () => {
    const { templates } = await readTemplateManifest();
    expect(templates.length).toBeGreaterThan(0);

    for (const template of templates) {
      expect(template.mainFile, `${template.id} must declare mainFile`).toBeTruthy();
      await expect(access(join(new URL('../templates/', import.meta.url).pathname, template.id, template.mainFile))).resolves.toBeUndefined();
    }
  });

  it('keeps every bundled LaTeX template in the committed manifest with user-facing metadata', async () => {
    const templateRoot = new URL('../templates/', import.meta.url).pathname;
    const rawManifest = JSON.parse(await readFile(join(templateRoot, 'manifest.json'), 'utf8'));
    const declared = new Map(rawManifest.templates.map(template => [template.id, template]));

    for (const entry of await readdir(templateRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const mainFile = await detectTemplateMainFile(join(templateRoot, entry.name)).catch(() => '');
      if (!mainFile) continue;
      const template = declared.get(entry.name);
      expect(template, `${entry.name} must be declared in manifest.json`).toBeTruthy();
      expect(template.mainFile).toBe(mainFile);
      expect(template.label).not.toBe(entry.name);
      expect(template.description).not.toBe(entry.name);
    }
  });

  it('returns only populated template categories and leaves the synthetic all category to the UI', async () => {
    const { templates, categories } = await readTemplateManifest();
    const populated = new Set(templates.map(template => template.category));
    expect(categories.map(category => category.id)).not.toContain('all');
    expect(categories.length).toBeGreaterThan(0);
    for (const category of categories) expect(populated.has(category.id), category.id).toBe(true);
  });

  it('fails readiness validation for malformed JSON or missing declared entry files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'paper-template-readiness-'));
    const manifestPath = join(root, 'manifest.json');
    try {
      await writeFile(manifestPath, '{not-json');
      await expect(validateTemplateCatalog({ manifestPath, templateDir: root })).rejects.toMatchObject({
        code: 'TEMPLATE_MANIFEST_INVALID',
      });

      await writeFile(manifestPath, JSON.stringify({
        categories: [{ id: 'academic', label: 'Academic' }],
        templates: [{ id: 'missing', label: 'Missing', description: 'Missing entry', category: 'academic', mainFile: 'main.tex' }],
      }));
      await expect(validateTemplateCatalog({ manifestPath, templateDir: root })).rejects.toThrow(/mainFile does not exist/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('resolves a known template and rejects unknown or unsafe IDs', async () => {
    await expect(resolveTemplateSelection('acl')).resolves.toMatchObject({
      id: 'acl',
      mainFile: 'acl_latex.tex',
    });
    await expect(resolveTemplateSelection('does-not-exist')).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    expect(() => validateTemplateId('../acl')).toThrow(/template id/i);
  });

  it('detects an uploaded template entry file instead of assuming main.tex', async () => {
    const root = await mkdtemp(join(tmpdir(), 'paper-template-contract-'));
    await mkdir(join(root, 'submission'));
    await writeFile(join(root, 'notes.tex'), '\\section{Notes}\n');
    await writeFile(join(root, 'submission', 'paper.tex'), '\\documentclass{article}\\begin{document}ok\\end{document}\n');

    await expect(detectTemplateMainFile(root)).resolves.toBe('submission/paper.tex');
  });

  it('rolls back the previous template and manifest when manifest commit fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'paper-template-rollback-'));
    const templateDir = join(root, 'templates');
    const manifestPath = join(templateDir, 'manifest.json');
    const targetRoot = join(templateDir, 'demo');
    const stagingRoot = join(templateDir, '.upload-staging');
    try {
      await mkdir(targetRoot, { recursive: true });
      await mkdir(stagingRoot, { recursive: true });
      await writeFile(join(targetRoot, 'main.tex'), '\\documentclass{article}\nOLD TEMPLATE\n');
      await writeFile(join(stagingRoot, 'main.tex'), '\\documentclass{article}\nNEW TEMPLATE\n');
      const previousManifest = {
        categories: [],
        templates: [{ id: 'demo', label: 'Old label', mainFile: 'main.tex' }],
      };
      await writeFile(manifestPath, JSON.stringify(previousManifest, null, 2));

      await expect(installTemplateFromStaging({
        templateId: 'demo',
        templateLabel: 'New label',
        stagingRoot,
        templateDir,
        manifestPath,
        fsApi: {
          rename: async (source, destination) => {
            if (destination === manifestPath) throw Object.assign(new Error('injected manifest rename failure'), { code: 'EIO' });
            const { rename } = await import('fs/promises');
            return rename(source, destination);
          },
        },
      })).rejects.toThrow('injected manifest rename failure');

      expect(await readFile(join(targetRoot, 'main.tex'), 'utf8')).toContain('OLD TEMPLATE');
      expect(JSON.parse(await readFile(manifestPath, 'utf8'))).toEqual(previousManifest);
      expect((await readdir(templateDir)).some(name => name.startsWith('.backup-demo-'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('serializes concurrent replacements so the template and manifest stay paired', async () => {
    const root = await mkdtemp(join(tmpdir(), 'paper-template-concurrent-'));
    const templateDir = join(root, 'templates');
    const manifestPath = join(templateDir, 'manifest.json');
    try {
      await mkdir(join(templateDir, 'demo'), { recursive: true });
      await writeFile(join(templateDir, 'demo', 'main.tex'), '\\documentclass{article}\nINITIAL\n');
      await writeFile(manifestPath, JSON.stringify({ categories: [], templates: [] }, null, 2));
      const stagingA = join(templateDir, '.upload-a');
      const stagingB = join(templateDir, '.upload-b');
      await mkdir(stagingA);
      await mkdir(stagingB);
      await writeFile(join(stagingA, 'main.tex'), '\\documentclass{article}\nCONTENT_A\n');
      await writeFile(join(stagingB, 'main.tex'), '\\documentclass{article}\nCONTENT_B\n');

      await Promise.all([
        installTemplateFromStaging({ templateId: 'demo', templateLabel: 'Label A', stagingRoot: stagingA, templateDir, manifestPath }),
        installTemplateFromStaging({ templateId: 'demo', templateLabel: 'Label B', stagingRoot: stagingB, templateDir, manifestPath }),
      ]);

      const content = await readFile(join(templateDir, 'demo', 'main.tex'), 'utf8');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const entry = manifest.templates.find(template => template.id === 'demo');
      expect([
        ['CONTENT_A', 'Label A'],
        ['CONTENT_B', 'Label B'],
      ]).toContainEqual([
        content.includes('CONTENT_A') ? 'CONTENT_A' : 'CONTENT_B',
        entry.label,
      ]);
      expect((await readdir(templateDir)).filter(name => name.startsWith('.backup-demo-'))).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
