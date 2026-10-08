import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startQaProvider } from './qa-provider.mjs';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const provider = await startQaProvider({ chunkDelayMs: 15 });
const app = await _electron.launch({ executablePath: require('electron'), args: [resolve('.'), '--demo-mode'], env });
const output = resolve('artifacts/qa');
await mkdir(output, { recursive: true });
const until = async fn => {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error('Timed out waiting for activity');
};
try {
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.overview-dot-card');
  const dot = await page.evaluate(async baseUrl => {
    await window.dots.api.updateSettings({ theme: 'light', desktopNotifications: false });
    const profile = await window.dots.api.saveProviderProfile({ label: 'Design QA', baseUrl, defaultModel: 'qa-model', apiKey: 'fixture' });
    return window.dots.api.createDot({ name: 'Clover', instructions: 'Use tools to check the workspace.', color: '#78b7a0', emoji: '🌱', providerId: profile.id, model: 'qa-model', notify: false, permissions: { files: 'write', shell: true, web: false, outsideWorkspace: false, approval: 'never' } });
  }, provider.baseUrl);
  await page.locator('.sidebar-dot').filter({ hasText: 'Clover' }).click();
  await page.getByRole('textbox', { name: 'Message Clover' }).fill('[qa:slow][qa:command] Write a project note and check the workspace.');
  await page.getByRole('textbox', { name: 'Message Clover' }).press('Enter');
  await page.waitForSelector('.work-event.is-working .activity-shell');
  const compact = await page.locator('.work-event.is-working').evaluate(el => ({ width: el.offsetWidth, parent: el.parentElement.clientWidth, background: getComputedStyle(el).backgroundColor }));
  assert.ok(compact.width < compact.parent * .6, JSON.stringify(compact));
  await page.screenshot({ path: resolve(output, 'activity-compact-light.png') });
  await until(() => page.evaluate(async id => (await window.dots.api.listRuns(id))[0]?.status === 'succeeded', dot.id));
  const row = page.locator('.work-event').filter({ hasText: 'Running a command' }).first();
  await row.getByRole('button').click();
  await row.locator('pre').waitFor();
  assert.equal(await row.getByRole('button').getAttribute('aria-expanded'), 'true');
  assert.ok((await row.locator('pre').textContent()).includes('desktop-dot-check'));
  assert.ok((await row.boundingBox()).width <= 561);
  await row.getByRole('button').click();
  assert.equal(await row.locator('pre').count(), 0);
  await page.evaluate(() => window.dots.api.updateSettings({ theme: 'dark' }));
  await until(() => page.evaluate(() => document.documentElement.dataset.theme === 'dark'));
  await page.screenshot({ path: resolve(output, 'activity-compact-dark.png') });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('widget.html')).setSize(960, 720));
  assert.ok(await page.locator('.work-event').evaluateAll(rows => rows.every(el => el.getBoundingClientRect().right <= el.parentElement.getBoundingClientRect().right + 1)));
  for (const action of ['minimize', 'close', 'minimize']) {
    await page.evaluate(action => window.dots.window.control(action), action);
    await until(() => app.windows().some(p => p.url().includes('widget.html')));
    const widget = app.windows().find(p => p.url().includes('widget.html'));
    await until(() => widget.evaluate(async () => (await window.desktopDot.getState()).visible));
    assert.ok(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('widget.html')).isFocusable()));
    await widget.getByRole('button', { name: 'Open Dots' }).click();
    await until(() => app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('widget.html')); return w.isVisible() && !w.isMinimized() && w.isFocused(); }));
    assert.ok((await page.locator('.workspace-breadcrumb').textContent()).includes('Clover'));
    console.log(`PASS single-click Open Dots after ${action}`);
  }
  assert.deepEqual(errors, []);
  console.log('PASS compact activity, expanded output, light/dark appearance, narrow window, and renderer errors');
} finally { await app.close(); await provider.close(); }
