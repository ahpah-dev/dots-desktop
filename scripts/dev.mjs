import { spawn } from 'node:child_process';
import { createServer } from 'vite';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const electronPath = require('electron');

const server = await createServer({ configFile: resolve(root, 'vite.config.ts') });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';

await new Promise((res, rej) => {
  const b = spawn(process.execPath, [resolve(root, 'scripts/build-main.mjs')], { stdio: 'inherit' });
  b.on('exit', (c) => (c === 0 ? res() : rej(new Error('main build failed'))));
});

const app = spawn(electronPath, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: url }
});
app.on('exit', async () => {
  await server.close();
  process.exit(0);
});
