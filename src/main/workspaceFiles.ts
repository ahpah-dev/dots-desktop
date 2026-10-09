import { promises as fs } from 'node:fs';
import { join, relative } from 'node:path';

export type WorkspaceEntry = { path: string; size: number; isDir: boolean; mtime: number };
const SKIP = new Set(['node_modules', '.git', '__pycache__', '.venv', 'vendor', '.next']);

/** A bounded scan; parallel stat batches keep large projects from making the UI wait on every file. */
export async function scanWorkspace(root: string): Promise<WorkspaceEntry[]> {
  const files: WorkspaceEntry[] = [];
  const folders = [{ path: root, depth: 0 }];
  while (folders.length && files.length < 1000) {
    const folder = folders.shift()!;
    const entries = (await fs.readdir(folder.path, { withFileTypes: true }).catch(() => []))
      .filter(entry => !entry.isSymbolicLink() && !(entry.isDirectory() && SKIP.has(entry.name)));
    for (let index = 0; index < entries.length && files.length < 1000; index += 16) {
      const batch = entries.slice(index, index + Math.min(16, 1000 - files.length));
      const stats = await Promise.all(batch.map(async entry => {
        const path = join(folder.path, entry.name);
        const stat = await fs.lstat(path).catch(() => null);
        return stat && !stat.isSymbolicLink() ? { path, stat } : null;
      }));
      for (const result of stats) {
        if (!result) continue;
        files.push({ path: relative(root, result.path), size: result.stat.size, isDir: result.stat.isDirectory(), mtime: result.stat.mtimeMs });
        if (result.stat.isDirectory() && folder.depth < 8) folders.push({ path: result.path, depth: folder.depth + 1 });
      }
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

/** Deduplicate overlapping views; explicit refresh and file events always invalidate the short cache. */
export class WorkspaceFileIndex {
  private records = new Map<string, { root: string; expires: number; files?: WorkspaceEntry[]; pending?: Promise<WorkspaceEntry[]> }>();
  constructor(private scan = scanWorkspace, private now = Date.now) {}

  list(id: string, root: string, refresh = false): Promise<WorkspaceEntry[]> {
    const existing = this.records.get(id);
    if (!refresh && existing?.root === root) {
      if (existing.pending) return existing.pending;
      if (existing.files && existing.expires > this.now()) return Promise.resolve(existing.files);
    }
    const record: { root: string; expires: number; files?: WorkspaceEntry[]; pending?: Promise<WorkspaceEntry[]> } = { root, expires: 0 };
    const pending = this.scan(root).then(files => {
      if (this.records.get(id) === record) {
        record.files = files; record.expires = this.now() + 750; record.pending = undefined;
      }
      return files;
    }).catch(error => { if (this.records.get(id) === record) this.records.delete(id); throw error; });
    record.pending = pending;
    this.records.set(id, record);
    return pending;
  }

  invalidate(id: string): void { this.records.delete(id); }
}
