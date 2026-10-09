import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanWorkspace, WorkspaceFileIndex, type WorkspaceEntry } from '../src/main/workspaceFiles';

const folders: string[] = [];
afterEach(async () => { await Promise.all(folders.splice(0).map(folder => fs.rm(folder, { recursive: true, force: true }))); });
describe('workspace file index', () => {
  it('lists nested files without dependencies, external links, or unbounded output', async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'dots-file-index-')); folders.push(root);
    await fs.mkdir(join(root, 'src', 'deep'), { recursive: true });
    await fs.mkdir(join(root, 'node_modules'));
    await fs.writeFile(join(root, 'src', 'deep', 'app.ts'), 'source');
    await fs.writeFile(join(root, 'node_modules', 'ignored.js'), 'dependency');
    await fs.symlink(tmpdir(), join(root, 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    const entries = await scanWorkspace(root);
    expect(entries.some(file => file.path.endsWith('app.ts') && file.size === 6)).toBe(true);
    expect(entries.some(file => /node_modules|external/.test(file.path))).toBe(false);
    await Promise.all(Array.from({ length: 1100 }, (_, index) => fs.writeFile(join(root, `file-${index}.txt`), 'x')));
    expect((await scanWorkspace(root)).length).toBe(1000);
  });

  it('shares one scan, honors force refresh, and expires cached entries', async () => {
    let calls = 0, time = 0;
    const index = new WorkspaceFileIndex(async () => { calls++; return [{ path: `${calls}.txt`, size: 1, isDir: false, mtime: calls }]; }, () => time);
    const first = index.list('dot', 'root');
    expect(index.list('dot', 'root')).toBe(first);
    await first;
    expect((await index.list('dot', 'root'))[0].path).toBe('1.txt');
    expect(calls).toBe(1);
    expect((await index.list('dot', 'root', true))[0].path).toBe('2.txt');
    time = 751;
    expect((await index.list('dot', 'root'))[0].path).toBe('3.txt');
    expect((await index.list('dot', 'another-root'))[0].path).toBe('4.txt');
  });

  it('does not cache an outdated scan after an agent writes a file', async () => {
    const resolveScans: ((files: WorkspaceEntry[]) => void)[] = [];
    const index = new WorkspaceFileIndex(() => new Promise(done => resolveScans.push(done)));
    const old = index.list('dot', 'root');
    index.invalidate('dot');
    const current = index.list('dot', 'root');
    resolveScans[1]([{ path: 'new.txt', size: 1, isDir: false, mtime: 2 }]);
    await current;
    resolveScans[0]([{ path: 'old.txt', size: 1, isDir: false, mtime: 1 }]);
    await old;
    expect((await index.list('dot', 'root'))[0].path).toBe('new.txt');
  });
});
