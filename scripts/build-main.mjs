import { build, context } from 'esbuild';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');

const common = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
  alias: { '@shared': resolve(root, 'src/shared') }
};

const targets = [
  { ...common, entryPoints: [resolve(root, 'src/main/index.ts')], outfile: resolve(root, 'dist/main/index.js') },
  { ...common, entryPoints: [resolve(root, 'src/preload/index.ts')], outfile: resolve(root, 'dist/preload/index.js') }
];

if (watch) {
  for (const t of targets) await (await context(t)).watch();
} else {
  await Promise.all(targets.map((t) => build(t)));
}
