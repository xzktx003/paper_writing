import path from 'node:path';

function splitPathList(value) {
  return String(value || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mergePathLists(configuredValue, inheritedValue) {
  return Array.from(new Set([
    ...splitPathList(configuredValue),
    ...splitPathList(inheritedValue),
  ])).join(path.delimiter);
}

/**
 * Build the environment used by all TeX and Pandoc subprocesses.
 *
 * The default is intentionally a byte-for-byte inheritance of the caller's
 * environment. Deployments that need non-standard tool or library locations
 * can prepend them explicitly without relying on HOME or host-specific paths.
 */
export function getCompileEnv(baseEnv = process.env) {
  const env = { ...baseEnv };
  if (splitPathList(baseEnv.OPENPRISM_COMPILE_PATH).length > 0) {
    env.PATH = mergePathLists(baseEnv.OPENPRISM_COMPILE_PATH, baseEnv.PATH);
  }
  if (splitPathList(baseEnv.OPENPRISM_COMPILE_LD_LIBRARY_PATH).length > 0) {
    env.LD_LIBRARY_PATH = mergePathLists(
      baseEnv.OPENPRISM_COMPILE_LD_LIBRARY_PATH,
      baseEnv.LD_LIBRARY_PATH,
    );
  }
  return env;
}

export function getTectonicBinary(baseEnv = process.env) {
  return String(baseEnv.OPENPRISM_TECTONIC_BINARY || '').trim() || 'tectonic';
}

export function getPandocPdfEngines(baseEnv = process.env) {
  return [
    `--pdf-engine=${getTectonicBinary(baseEnv)}`,
    '--pdf-engine=xelatex',
    '--pdf-engine=pdflatex',
  ];
}
