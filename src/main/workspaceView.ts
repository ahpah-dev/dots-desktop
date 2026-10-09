import { promises as fs } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const TEXT_LIMIT = 512 * 1024;
const ASSET_LIMIT = 8 * 1024 * 1024;
const mime: Record<string, string> = {
  '.html': 'text/html', '.htm': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.txt': 'text/plain',
};

/** Renderer reads always stay in the real workspace, even for Dots with extended access. */
export async function workspaceFile(root: string, file: string): Promise<string> {
  if (typeof file !== 'string' || !file || file.includes('\0')) throw new Error('Choose a workspace file.');
  const realRoot = await fs.realpath(root);
  const candidate = resolve(realRoot, file);
  const inside = (target: string) => {
    const rel = relative(realRoot, target);
    return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
  };
  if (!inside(candidate)) throw new Error('That file is outside this workspace.');
  const realFile = await fs.realpath(candidate);
  if (!inside(realFile)) throw new Error('That file points outside this workspace.');
  return realFile;
}

async function boundedRead(file: string, limit: number): Promise<Buffer> {
  const handle = await fs.open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('Choose a file, not a folder.');
    if (stat.size > limit) throw new Error(`This file is too large to preview (${Math.round(limit / 1024)} KB maximum).`);
    // Bound the allocation/read as well as the stat: a file can grow while an agent writes it.
    const buffer = Buffer.alloc(limit + 1);
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const part = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
      if (!part.bytesRead) break;
      bytesRead += part.bytesRead;
    }
    if (bytesRead > limit) throw new Error('This file grew too large to preview.');
    return buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

export async function readWorkspaceText(root: string, file: string): Promise<{ path: string; content: string; size: number }> {
  const buffer = await boundedRead(await workspaceFile(root, file), TEXT_LIMIT);
  if (buffer.includes(0)) throw new Error('This is a binary file. Open it in its usual app.');
  let content: string;
  try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch { throw new Error('This file is not UTF-8 text. Open it in its usual app.'); }
  return { path: file, content, size: buffer.length };
}

/** Read-only loopback hosting gives static projects real relative CSS, JS, images and module imports. */
export class WorkspacePreviews {
  private entries = new Map<string, { root: string; origin: string; token: string; server: Server }>();
  private pending = new Map<string, Promise<{ url: string }>>();
  private closed = false;

  async start(dotId: string, root: string, file: string): Promise<{ url: string }> {
    const job = (this.pending.get(dotId) ?? Promise.resolve()).catch(() => undefined).then(() => this.startCurrent(dotId, root, file));
    this.pending.set(dotId, job);
    try { return await job; } finally { if (this.pending.get(dotId) === job) this.pending.delete(dotId); }
  }

  private async startCurrent(dotId: string, root: string, file: string): Promise<{ url: string }> {
    if (this.closed) throw new Error('Previews are closed.');
    if (!/\.html?$/i.test(file)) throw new Error('Choose an HTML file for a static preview, or connect a running dev server.');
    await workspaceFile(root, file);
    const realRoot = await fs.realpath(root);
    let entry = this.entries.get(dotId);
    if (entry && entry.root !== realRoot) { entry.server.closeAllConnections(); entry.server.close(); this.entries.delete(dotId); entry = undefined; }
    if (!entry) {
      const token = randomBytes(24).toString('hex');
      let origin = '';
      const server = createServer(async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'no-referrer');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Security-Policy', `default-src ${origin} data:; script-src ${origin} 'unsafe-inline'; style-src ${origin} 'unsafe-inline'; connect-src ${origin}; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'`);
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
        try {
          const pathname = (req.url ?? '').split('?')[0];
          if (!pathname.startsWith(`/${token}/`)) { res.writeHead(404); res.end(); return; }
          const filePath = decodeURIComponent(pathname.slice(token.length + 2));
          if (!filePath || filePath.split(/[\\/]/).some(part => part.startsWith('.')) || isAbsolute(filePath)) throw new Error('Unavailable');
          const type = mime[extname(filePath).toLowerCase()];
          if (!type) throw new Error('Unavailable');
          const body = await boundedRead(await workspaceFile(realRoot, filePath), ASSET_LIMIT);
          res.setHeader('Content-Type', type + (/^(text\/|application\/json)/.test(type) ? '; charset=utf-8' : ''));
          res.writeHead(200);
          res.end(req.method === 'HEAD' ? undefined : body);
        } catch { res.writeHead(404); res.end('File unavailable in this preview.'); }
      });
      await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Could not start the preview.');
      origin = `http://127.0.0.1:${address.port}`;
      if (this.closed) { server.closeAllConnections(); server.close(); throw new Error('Previews are closed.'); }
      entry = { root: realRoot, origin, token, server };
      this.entries.set(dotId, entry);
    }
    return { url: `${entry.origin}/${entry.token}/${file.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/')}` };
  }

  stop(dotId: string): void {
    const entry = this.entries.get(dotId);
    if (entry) { entry.server.closeAllConnections(); entry.server.close(); this.entries.delete(dotId); }
  }

  close(): void { this.closed = true; for (const id of this.entries.keys()) this.stop(id); }
}
