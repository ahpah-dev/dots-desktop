import { promises as fs, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { clip } from '../util/misc';
import { ToolError, num, str, type Tool, type ToolContext } from './types';

/** True if `target` is `root` or inside it (after normalisation). */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function realOrSelf(p: string): string {
  try { return realpathSync.native(p); } catch { return p; }
}

/**
 * Resolve a user/model-supplied path against the workspace and refuse anything that escapes it
 * (via `..`, absolute paths or symlinks) unless the Dot has `outsideWorkspace` access.
 */
export function resolvePath(ctx: ToolContext, p: string): string {
  const abs = resolve(ctx.workspace, p || '.');
  if (ctx.permissions.outsideWorkspace) return abs;
  const root = realOrSelf(ctx.workspace);
  // Resolve symlinks on the deepest existing ancestor so a link inside the workspace can't point out of it.
  let probe = abs;
  while (probe !== dirname(probe)) {
    try { realpathSync.native(probe); break; } catch { probe = dirname(probe); }
  }
  const realProbe = realOrSelf(probe);
  const real = resolve(realProbe, relative(probe, abs));
  if (!isInside(root, real)) {
    throw new ToolError(`Access denied: "${p}" is outside this Dot's workspace (${ctx.workspace}).`);
  }
  return abs;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'target']);

async function walk(dir: string, max: number, out: string[], root: string): Promise<void> {
  if (out.length >= max) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const e of entries) {
    if (out.length >= max) return;
    const p = resolve(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      out.push(`${relative(root, p)}${sep}`);
      await walk(p, max, out, root);
    } else out.push(relative(root, p));
  }
}

export const listFiles: Tool = {
  name: 'list_files',
  description: 'List files and folders in the workspace (recursive, skips node_modules/.git/etc). Returns up to 300 entries.',
  category: 'file',
  parameters: { type: 'object', properties: { path: { type: 'string', description: 'Directory relative to the workspace. Default: workspace root.' } } },
  describe: (a) => `List ${a.path || '.'}`,
  async run(args, ctx) {
    const dir = resolvePath(ctx, str(args, 'path', false));
    const out: string[] = [];
    await walk(dir, 300, out, dir);
    return out.length ? out.join('\n') + (out.length >= 300 ? '\n… (truncated)' : '') : '(empty)';
  }
};

export const readFile: Tool = {
  name: 'read_file',
  description: 'Read a UTF-8 text file. Use offset/limit (in lines) for large files.',
  category: 'file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      offset: { type: 'number', description: '1-based starting line. Default 1.' },
      limit: { type: 'number', description: 'Max lines. Default 400.' }
    },
    required: ['path']
  },
  describe: (a) => `Read ${a.path}`,
  async run(args, ctx) {
    const file = resolvePath(ctx, str(args, 'path'));
    const stat = await fs.stat(file).catch(() => null);
    if (!stat) throw new ToolError(`File not found: ${args.path}`);
    if (stat.isDirectory()) throw new ToolError(`${args.path} is a directory; use list_files.`);
    if (stat.size > 5 * 1024 * 1024) throw new ToolError('File is larger than 5 MB.');
    const text = await fs.readFile(file, 'utf8');
    if (text.includes('\u0000')) throw new ToolError('This looks like a binary file.');
    const lines = text.split('\n');
    const offset = Math.max(1, Math.floor(num(args, 'offset', 1)));
    const limit = Math.max(1, Math.min(2000, Math.floor(num(args, 'limit', 400))));
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const more = offset - 1 + limit < lines.length ? `\n… (${lines.length - (offset - 1 + limit)} more lines; total ${lines.length})` : '';
    return clip(slice.map((l, i) => `${offset + i}\t${l}`).join('\n'), 40_000) + more;
  }
};

export const writeFile: Tool = {
  name: 'write_file',
  description: 'Create or overwrite a text file (parent folders are created). Prefer edit_file for small changes.',
  category: 'file',
  parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] },
  describe: (a) => `Write ${a.path}`,
  async run(args, ctx) {
    if (ctx.permissions.files !== 'write') throw new ToolError('This Dot has read-only file access.');
    const file = resolvePath(ctx, str(args, 'path'));
    const content = str(args, 'content');
    if (ctx.permissions.approval === 'ask') {
      const ok = await ctx.requestApproval({ kind: 'write', summary: `Write ${args.path}`, detail: clip(content, 1500) });
      if (!ok) throw new ToolError('The user declined this action.');
    }
    await fs.mkdir(dirname(file), { recursive: true });
    await fs.writeFile(file, content, 'utf8');
    return `Wrote ${content.length} characters to ${args.path}.`;
  }
};

export const editFile: Tool = {
  name: 'edit_file',
  description: 'Replace one exact occurrence of `old_text` with `new_text` in a file. `old_text` must match exactly once.',
  category: 'file',
  parameters: {
    type: 'object',
    properties: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } },
    required: ['path', 'old_text', 'new_text']
  },
  describe: (a) => `Edit ${a.path}`,
  async run(args, ctx) {
    if (ctx.permissions.files !== 'write') throw new ToolError('This Dot has read-only file access.');
    const file = resolvePath(ctx, str(args, 'path'));
    const oldText = str(args, 'old_text');
    const newText = str(args, 'new_text');
    if (!oldText) throw new ToolError('old_text must not be empty.');
    const text = await fs.readFile(file, 'utf8').catch(() => { throw new ToolError(`File not found: ${args.path}`); });
    const first = text.indexOf(oldText);
    if (first < 0) throw new ToolError('old_text was not found. Read the file again and copy the text exactly.');
    if (text.indexOf(oldText, first + 1) >= 0) throw new ToolError('old_text matches more than once; include more surrounding context.');
    if (ctx.permissions.approval === 'ask') {
      const ok = await ctx.requestApproval({ kind: 'write', summary: `Edit ${args.path}`, detail: `- ${clip(oldText, 600)}\n+ ${clip(newText, 600)}` });
      if (!ok) throw new ToolError('The user declined this action.');
    }
    await fs.writeFile(file, text.slice(0, first) + newText + text.slice(first + oldText.length), 'utf8');
    return `Edited ${args.path}.`;
  }
};

export const searchFiles: Tool = {
  name: 'search_files',
  description: 'Search text files in the workspace for a regular expression. Returns matching lines as path:line: text (max 100).',
  category: 'file',
  parameters: {
    type: 'object',
    properties: { pattern: { type: 'string', description: 'JavaScript regular expression' }, path: { type: 'string' } },
    required: ['pattern']
  },
  describe: (a) => `Search “${a.pattern}”`,
  async run(args, ctx) {
    let re: RegExp;
    try { re = new RegExp(str(args, 'pattern'), 'i'); } catch { throw new ToolError('Invalid regular expression.'); }
    const dir = resolvePath(ctx, str(args, 'path', false));
    const files: string[] = [];
    await walk(dir, 5000, files, dir);
    const hits: string[] = [];
    for (const rel of files) {
      if (hits.length >= 100 || ctx.signal.aborted) break;
      if (rel.endsWith(sep)) continue;
      const abs = resolve(dir, rel);
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat || stat.size > 1024 * 1024) continue;
      const text = await fs.readFile(abs, 'utf8').catch(() => '');
      if (text.includes('\u0000')) continue;
      const lines = text.split('\n');
      for (let i = 0; i < lines.length && hits.length < 100; i++) {
        if (re.test(lines[i])) hits.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
      }
    }
    return hits.length ? hits.join('\n') : 'No matches.';
  }
};
