const SECRET_KEY_PATTERN = /(?:api[_-]?key|token|secret|password|credential|authorization|cookie)/i;
const SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9._-]+/g,
  /Bearer\s+[^\s,;"']+/gi,
];

function redactText(value, maxLength = 240) {
  let text = String(value ?? '');
  for (const pattern of SECRET_VALUE_PATTERNS) {
    text = text.replace(pattern, match => match.toLowerCase().startsWith('bearer')
      ? 'Bearer [REDACTED]'
      : '[REDACTED]');
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function redactValue(value, depth = 0) {
  if (depth > 3) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.slice(0, 8).map(item => redactValue(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).slice(0, 16).map(([key, nested]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? '[REDACTED]' : redactValue(nested, depth + 1),
    ]));
  }
  return typeof value === 'string' ? redactText(value) : value;
}

function safeJson(value) {
  try { return JSON.stringify(redactValue(value)); } catch { return redactText(value); }
}

function projectPathFromInput(input = {}) {
  return redactText(input.path || input.filename || input.script || '', 180);
}

export function summarizeToolUse(name, input = {}) {
  switch (name) {
    case 'list_project_files':
      return { detail: '正在读取项目文件清单' };
    case 'read_project_file':
    case 'read_chapter':
    case 'read_code':
      return { detail: projectPathFromInput(input) || '正在读取所选文件' };
    case 'list_chapters':
      return { detail: '正在读取章节清单' };
    case 'read_references':
      return { detail: 'references.bib' };
    case 'propose_edit':
      return { detail: projectPathFromInput(input) || '正在准备可审查修改' };
    case 'write_code':
      return { detail: projectPathFromInput(input) || '正在写入代码文件' };
    case 'run_code': {
      const script = projectPathFromInput(input) || 'script';
      const args = Array.isArray(input.args) ? input.args.slice(0, 8).map(arg => redactText(arg, 80)).join(' ') : '';
      return { detail: redactText(`${script}${args ? ` ${args}` : ''}`, 240) };
    }
    default:
      return { detail: safeJson(input).slice(0, 320) };
  }
}

export function summarizeToolResult(name, result) {
  switch (name) {
    case 'read_project_file':
    case 'read_chapter':
    case 'read_code':
    case 'read_references':
      return { detail: '读取完成（正文未展示）' };
    case 'list_project_files':
    case 'list_chapters':
    case 'list_code': {
      try {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
        return { detail: `已找到 ${count} 个条目` };
      } catch {
        return { detail: '清单读取完成' };
      }
    }
    case 'propose_edit': {
      try {
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        return { detail: `${redactText(parsed?.filename || '文件', 180)} 的修改提案已就绪` };
      } catch {
        return { detail: '修改提案已就绪' };
      }
    }
    case 'write_code':
      return { detail: '写入完成' };
    case 'run_code': {
      const match = String(result ?? '').match(/Exit code:\s*(-?\d+)/i);
      return { detail: match ? `执行完成，退出码 ${match[1]}` : '执行完成（输出未展示）' };
    }
    default:
      return { detail: redactText(typeof result === 'string' ? result : safeJson(result), 240) };
  }
}
