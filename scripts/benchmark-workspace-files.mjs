/** Repeatable local filesystem benchmark; does not touch user workspaces. */
import { promises as fs } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const output = resolve('artifacts/qa/workspace-index'); await fs.mkdir(output, { recursive: true });
const compiled = join(output, 'workspaceFiles.cjs');
await build({ entryPoints: ['src/main/workspaceFiles.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: compiled });
const { scanWorkspace, WorkspaceFileIndex } = require(compiled);
const root = await fs.mkdtemp(join(output, 'project-'));
for (let directory = 0; directory < 15; directory++) {
  const folder = join(root, `src-${directory}`); await fs.mkdir(folder);
  await Promise.all(Array.from({ length: 50 }, (_, index) => fs.writeFile(join(folder, `file-${index}.ts`), `export const n = ${index};\n`)));
}
async function sequential() {
  const files = [];
  const walk = async directory => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name), stat = await fs.stat(path);
      files.push({ path: relative(root, path), size: stat.size, isDir: entry.isDirectory(), mtime: stat.mtimeMs });
      if (entry.isDirectory()) await walk(path);
    }
  };
  await walk(root); return files.sort((a, b) => b.mtime - a.mtime);
}
await sequential(); await scanWorkspace(root);
const old = [], updated = [];
for (let trial = 0; trial < 6; trial++) {
  let start = performance.now(); const before = await sequential(); old.push(performance.now() - start);
  start = performance.now(); const after = await scanWorkspace(root); updated.push(performance.now() - start);
  if (before.length !== after.length || before.length !== 765) throw new Error('Benchmark scans differ.');
}
let scans = 0;
const index = new WorkspaceFileIndex(async path => { scans++; return scanWorkspace(path); });
const start = performance.now(); await Promise.all(Array.from({ length: 10 }, () => index.list('dot', root))); const sharedMs = performance.now() - start;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const result = { fixtureEntries: 765, trials: 6, sequentialMedianMs: median(old), parallelMedianMs: median(updated), overlappingRequests: 10, actualScans: scans, sharedRequestsMs: sharedMs, scope: 'Local warm filesystem scan; not whole-app startup or provider latency.' };
await fs.writeFile(join(output, 'benchmark.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
