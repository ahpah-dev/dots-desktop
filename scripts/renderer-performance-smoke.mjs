import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const fixtureFolder = resolve('artifacts/qa/renderer-performance');
await mkdir(fixtureFolder, { recursive: true });
const compiled = await build({
  stdin: { resolveDir: resolve('.'), sourcefile: 'performance-fixture.tsx', loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { AppProvider, useApp, useRunEvents, useStreamingDraft } from './src/renderer/context/AppContext';
    const counts = { app: 0, events: 0, draft: 0 };
    const listeners = new Set();
    const run = { id: 'one', dotId: 'dot', conversationId: 'one', createdAt: 1, status: 'running', trigger: 'manual', prompt: 'Fixture', title: 'Fixture', newSession: true };
    const dot = { id: 'dot', name: 'Fixture', status: 'running', createdAt: 1, color: '#6b8c79', providerId: 'fixture', model: 'fixture', workspacePath: '/fixture' };
    const settings = { theme: 'light', onboardingComplete: true };
    window.dots = { api: {
      getBootstrap: async () => ({ version: 'fixture', platform: 'win32', dots: [dot], providers: [], approvals: [], settings, auth: { loggedIn: true, installed: true } }),
      listProviderOptions: async () => [], listRuns: async () => [run],
      getRunEvents: async () => [{ type: 'user', text: 'Fixture', seq: 1, ts: 1, runId: 'one', dotId: 'dot' }],
    }, onEvent: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
    function AppProbe() { useApp(); counts.app++; return <span id="app-probe">Chrome</span>; }
    function EventsProbe() { const events = useRunEvents(); counts.events++; return <span id="events-probe" data-count={events.length}>{events.at(-1)?.type}</span>; }
    function DraftProbe() { const draft = useStreamingDraft(); counts.draft++; return <span id="draft-probe">{draft}</span>; }
    const root = createRoot(document.getElementById('root'));
    root.render(<AppProvider><AppProbe /><EventsProbe /><DraftProbe /></AppProvider>);
    window.fixture = { counts, emit: event => listeners.forEach(listener => listener(event)), unmount: () => root.unmount(), listenerCount: () => listeners.size };
  ` },
  bundle: true, platform: 'browser', format: 'iife', write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
});
await writeFile(resolve(fixtureFolder, 'fixture.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script>${compiled.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`);
await writeFile(resolve(fixtureFolder, 'main.cjs'), `const { app, BrowserWindow } = require('electron'); app.whenReady().then(() => { const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true } }); win.loadFile(require('node:path').join(__dirname, 'fixture.html')); }); app.on('window-all-closed', () => app.quit());`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: require('electron'), args: [resolve(fixtureFolder, 'main.cjs')], env });
try {
  const page = await app.firstWindow();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => document.getElementById('events-probe')?.dataset.count === '1');
  const initial = await page.evaluate(() => ({ ...window.fixture.counts }));
  await page.evaluate(() => {
    for (let index = 0; index < 500; index++) window.fixture.emit({ type: 'run-event', event: { type: 'draft', id: 'draft', text: 'Chunk ' + index, seq: 0, ts: index, runId: 'one', dotId: 'dot' } });
  });
  await page.waitForFunction(() => document.getElementById('draft-probe')?.textContent === 'Chunk 499');
  const afterDraft = await page.evaluate(() => ({ ...window.fixture.counts }));
  assert.equal(afterDraft.app, initial.app, 'A token burst must not rerender useApp consumers.');
  assert.equal(afterDraft.events, initial.events, 'A token burst must not rerender file/tool subscribers.');
  assert.equal(afterDraft.draft - initial.draft, 1, 'A token burst should publish only its latest text.');

  await page.evaluate(() => {
    for (let index = 2; index <= 2_001; index++) window.fixture.emit({ type: 'run-event', event: { type: 'log', level: 'info', text: 'Event ' + index, seq: index, ts: index, runId: 'one', dotId: 'dot' } });
  });
  await page.waitForFunction(() => document.getElementById('events-probe')?.dataset.count === '2001');
  const afterEvents = await page.evaluate(() => ({ ...window.fixture.counts }));
  assert.equal(afterEvents.app, initial.app, 'Durable event bursts must not rerender useApp consumers.');
  assert.equal(afterEvents.events - afterDraft.events, 1, 'Every durable event should be retained with one snapshot publication.');
  assert.equal(await page.locator('#draft-probe').textContent(), '');

  await page.evaluate(() => window.fixture.emit({ type: 'run-event', event: { type: 'final', text: 'Complete', seq: 2_002, ts: 2_002, runId: 'one', dotId: 'dot' } }));
  await page.waitForFunction(() => document.getElementById('events-probe')?.textContent === 'final');
  await page.evaluate(() => window.fixture.unmount());
  assert.equal(await page.evaluate(() => window.fixture.listenerCount()), 0, 'Unmount should remove its IPC listener.');
  assert.deepEqual(errors, []);
  const report = {
    initial, afterDraft, afterEvents,
    draftChunks: 500, retainedEvents: 2_002,
    chromeRendersDuringDraft: afterDraft.app - initial.app,
    fileSubscriberRendersDuringDraft: afterDraft.events - initial.events,
    durableBurstRenderCount: afterEvents.events - afterDraft.events,
    rendererErrors: errors,
  };
  await writeFile(resolve(fixtureFolder, 'report.json'), JSON.stringify(report, null, 2));
  console.log('PASS React/Electron streaming isolation, lossless burst batching, final delivery, listener cleanup and zero renderer errors');
  console.log(JSON.stringify(report, null, 2));
} finally { await app.close(); }
