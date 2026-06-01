import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { generatePaperProjectJson } from '../../scripts/generate-paper-project-json.mjs';

describe('generate paper project metadata script', () => {
  let root;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'paper-projects-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('creates project.json for paper folders without existing metadata', async () => {
    await mkdir(join(root, 'MSAVQ'), { recursive: true });
    await writeFile(join(root, 'MSAVQ', 'paper.tex'), '\\documentclass{article}\n');

    const results = await generatePaperProjectJson(root);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('created');

    const meta = JSON.parse(await readFile(join(root, 'MSAVQ', 'project.json'), 'utf8'));
    expect(meta).toMatchObject({
      name: 'MSAVQ',
      tags: [],
      archived: false,
      trashed: false,
      trashedAt: null,
    });
    expect(meta.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(meta.createdAt).toString()).not.toBe('Invalid Date');
    expect(new Date(meta.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('keeps existing project.json untouched unless force is requested', async () => {
    await mkdir(join(root, 'torq'), { recursive: true });
    await writeFile(join(root, 'torq', 'example_paper.tex'), '\\documentclass{article}\n');
    await writeFile(join(root, 'torq', 'project.json'), JSON.stringify({
      id: 'existing-id',
      name: 'Existing Project',
      createdAt: '2026-05-01T00:00:00.000Z',
    }, null, 2));

    const results = await generatePaperProjectJson(root);

    expect(results).toEqual([{
      dir: 'torq',
      status: 'skipped',
      reason: 'project.json already exists',
    }]);
    const meta = JSON.parse(await readFile(join(root, 'torq', 'project.json'), 'utf8'));
    expect(meta).toEqual({
      id: 'existing-id',
      name: 'Existing Project',
      createdAt: '2026-05-01T00:00:00.000Z',
    });
  });

  it('supports dry-run without writing project.json', async () => {
    await mkdir(join(root, 'draft'), { recursive: true });
    await writeFile(join(root, 'draft', 'main.tex'), '\\documentclass{article}\n');

    const results = await generatePaperProjectJson(root, { dryRun: true });

    expect(results[0].status).toBe('planned');
    await expect(readFile(join(root, 'draft', 'project.json'), 'utf8')).rejects.toThrow(/ENOENT/);
  });

  it('can be run from inside a single paper folder', async () => {
    await writeFile(join(root, 'main.tex'), '\\documentclass{article}\n');

    const results = await generatePaperProjectJson(root);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('created');
    const meta = JSON.parse(await readFile(join(root, 'project.json'), 'utf8'));
    expect(meta.name).toBe(root.split('/').pop());
  });
});
