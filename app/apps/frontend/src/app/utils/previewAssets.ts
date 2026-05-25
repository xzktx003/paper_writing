export const BROWSER_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'];
export const GRAPHIC_EXTENSIONS = [...BROWSER_IMAGE_EXTENSIONS, '.pdf', '.eps'];
export const TEXT_EXTENSIONS = ['.md', '.markdown', '.tex', '.txt', '.bib', '.sty', '.cls', '.bst', '.yaml', '.yml', '.json', '.py', '.sh', '.js', '.ts', '.tsx', '.css'];
export const DRAWIO_EXTENSIONS = ['.drawio'];

const PROJECT_ROOT_DIRS = new Set([
  'fig',
  'figures',
  'img',
  'images',
  'docs',
  'sec',
  'appendix',
  'tab',
  'chapters',
  'code',
  'output',
]);

export function getOpenPrismProjectId(projectPath?: string | null): string | null {
  if (!projectPath?.startsWith('__openprism__:')) return null;
  return projectPath.replace('__openprism__:', '');
}

export function isImagePath(filePath: string): boolean {
  const clean = stripQueryAndHash(filePath).toLowerCase();
  return BROWSER_IMAGE_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

export function isGraphicPath(filePath: string): boolean {
  const clean = stripQueryAndHash(filePath).toLowerCase();
  return GRAPHIC_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

export function isPdfPath(filePath: string): boolean {
  return stripQueryAndHash(filePath).toLowerCase().endsWith('.pdf');
}

export function isPreviewableTextPath(filePath: string): boolean {
  const clean = stripQueryAndHash(filePath).toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

export function isDrawioPath(filePath: string): boolean {
  const clean = stripQueryAndHash(filePath).toLowerCase();
  return DRAWIO_EXTENSIONS.some((ext) => clean.endsWith(ext));
}

export function resolveProjectAssetUrl(projectId: string | null | undefined, currentFile: string, src: string | undefined): string | undefined {
  if (!src) return src;
  if (!projectId || isExternalUrl(src)) return src;

  const { path, suffix } = splitPathSuffix(src);
  const normalized = normalizeProjectPath(resolveProjectPath(currentFile, decodeURI(path)));
  if (!normalized) return src;

  const qs = new URLSearchParams({ path: normalized }).toString();
  return `/api/projects/${encodeURIComponent(projectId)}/blob?${qs}${suffix}`;
}

export function resolveProjectPath(currentFile: string, assetPath: string): string {
  const clean = assetPath.trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.startsWith('#')) return clean;
  if (clean.startsWith('./')) {
    return joinProjectPath(dirname(currentFile), clean.slice(2));
  }
  if (clean.startsWith('../')) {
    return joinProjectPath(dirname(currentFile), clean);
  }
  const [first] = clean.split('/');
  if (PROJECT_ROOT_DIRS.has(first)) return clean;
  return joinProjectPath(dirname(currentFile), clean);
}

function isExternalUrl(src: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src);
}

function splitPathSuffix(src: string): { path: string; suffix: string } {
  const match = src.match(/^([^?#]*)([?#].*)?$/);
  return { path: match?.[1] || src, suffix: match?.[2] || '' };
}

function stripQueryAndHash(src: string): string {
  return src.split(/[?#]/, 1)[0] || '';
}

function dirname(filePath: string): string {
  const clean = stripQueryAndHash(filePath).replace(/\\/g, '/');
  const idx = clean.lastIndexOf('/');
  return idx >= 0 ? clean.slice(0, idx) : '';
}

function joinProjectPath(base: string, child: string): string {
  return normalizeProjectPath(`${base ? `${base}/` : ''}${child}`);
}

function normalizeProjectPath(filePath: string): string {
  const parts: string[] = [];
  for (const part of filePath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}
