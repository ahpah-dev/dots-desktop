/** Isolated renderer → IPC → local fixture: long chats, search, drafts and branches. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url), { _electron } = require('playwright');
const output = resolve('artifacts/qa/conversation-workflow');
await mkdir(output, { recursive: true });
const checks = [], errors = [];
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'conversation-fixture' }] })); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw), prompt = body.messages.findLast(message => message.role === 'user')?.content || '';
  if (String(prompt).includes('attention-marker')) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Fixture failure: project needs attention' } })); return; }
  const text = `### A clear next step\n\n${String(prompt).slice(0, 110)}\n\n${Array.from({ length: 12 }, (_, index) => `- Step ${index + 1}: keep the project moving with a small, useful improvement.`).join('\n')}\n\n**Checked:** this is an isolated local conversation fixture.`;
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 200 } }));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require('electron'), args: process.env.DOTS_SMOKE_EXECUTABLE ? ['--demo-mode'] : [resolve('.'), '--demo-mode'], env, timeout: 60000 });
// Keep the person's original clipboard content only in the trusted test process.
await app.evaluate(({ clipboard }) => { globalThis.__conversationQaClipboardBackup = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: clipboard.readImage() }; });
const check = (name, condition = true) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
const until = async predicate => { const end = Date.now() + 45000; while (!(await predicate())) { if (Date.now() > end) throw new Error('Conversation workflow timed out'); await new Promise(done => setTimeout(done, 100)); } };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.overview-dot-card');
  await page.setViewportSize({ width: 1440, height: 920 });
  const dot = await page.evaluate(async ({ baseUrl, output }) => {
    await window.dots.api.updateSettings({ desktopDotEnabled: false, desktopNotifications: false, defaultWorkspaceRoot: output });
    const provider = await window.dots.api.saveProviderProfile({ label: 'Conversation QA', baseUrl, defaultModel: 'conversation-fixture', requiresKey: false });
    return window.dots.api.createDot({ name: 'Story', description: 'A long conversation with a clear next step.', color: '#7daea0', instructions: '', providerId: provider.id, model: 'conversation-fixture', permissions: { files: 'write', shell: false, web: false, talkToDots: false, outsideWorkspace: false, approval: 'never' }, notify: false });
  }, { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, output });
  const runIds = [];
  for (let index = 0; index < 28; index += 1) {
    const prompt = index === 0 ? 'Build a greenhouse plan' : index === 3 ? 'Remember orchid-marker for the greenhouse' : `Refine the greenhouse plan, turn ${index + 1}`;
    const run = await page.evaluate(({ dotId, previous, prompt }) => previous ? window.dots.api.continueRun(previous, prompt) : window.dots.api.startRun(dotId, prompt, { newSession: true }), { dotId: dot.id, previous: runIds.at(-1), prompt });
    runIds.push(run.id);
    await until(() => page.evaluate(({ dotId, runId }) => window.dots.api.listRuns(dotId, 200).then(runs => runs.find(run => run.id === runId)?.status === 'succeeded'), { dotId: dot.id, runId: run.id }));
  }
  await page.locator('.sidebar-dot').filter({ hasText: 'Story' }).click();
  await until(async () => await page.locator('.conversation-turn').count() === 13 && await page.getByRole('button', { name: /^Load earlier messages/ }).count() === 1);
  check('Long conversation initially renders only the latest 13 turns', await page.locator('.conversation-turn').count() === 13);
  check('Exactly one conversation and composer', await page.locator('.conversation').count() === 1 && await page.locator('.composer textarea').count() === 1);
  await until(() => page.locator('.conversation-scroll').evaluate(element => element.scrollTop > 0 && element.scrollHeight - element.scrollTop - element.clientHeight < 3));
  await page.screenshot({ path: join(output, 'initial-conversation.png') });
  const expectedCopy = await page.evaluate(runId => window.dots.api.getRunEvents(runId).then(events => events.findLast(event => event.type === 'final')?.text), runIds.at(-1));
  await page.locator('.final-message').last().getByRole('button', { name: 'Copy result', exact: true }).click();
  await until(() => app.evaluate(({ clipboard }) => clipboard.readText()).then(text => text === expectedCopy));
  check('Copy result writes the exact answer through the trusted bridge');
  const rejection = await page.evaluate(async () => {
    const rejected = [];
    for (const input of [123, 'x'.repeat(1_000_001)]) {
      try { await window.dots.api.writeClipboardText(input); rejected.push(false); } catch { rejected.push(true); }
    }
    return { rejected, canRead: 'readClipboardText' in window.dots.api };
  });
  check('Clipboard bridge rejects invalid and oversized payloads without exposing reads', rejection.rejected.every(Boolean) && !rejection.canRead && await app.evaluate(({ clipboard }) => clipboard.readText()) === expectedCopy);
  const nestedDenied = await app.evaluate(async ({ ipcMain, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(window => !window.webContents.getURL().includes('desktop-dot'));
    const handler = ipcMain._invokeHandlers.get('api:writeClipboardText');
    try { await handler({ sender: window.webContents, senderFrame: { url: window.webContents.mainFrame.url } }, 'Should never be copied'); return false; }
    catch (error) { return error.message.includes('Untrusted sender'); }
  });
  check('Registered clipboard handler denies nested renderer frames', nestedDenied && await app.evaluate(({ clipboard }) => clipboard.readText()) === expectedCopy);
  await page.locator('.conversation-scroll').evaluate(element => { element.scrollTop = 0; });
  await until(async () => await page.getByRole('button', { name: /Jump to latest/ }).count() === 1);
  check('Reading earlier messages exposes Jump to latest');
  const before = await page.locator('.conversation-turn').first().evaluate(element => ({ id: element.dataset.turnId, top: element.getBoundingClientRect().top }));
  await page.getByRole('button', { name: /^Load earlier messages/ }).click();
  await until(async () => await page.locator('.conversation-turn').count() === 25 && await page.getByRole('button', { name: /^Load earlier messages/ }).isEnabled());
  const after = await page.locator(`[data-turn-id="${before.id}"]`).evaluate(element => element.getBoundingClientRect().top);
  check('Loading earlier messages preserves the current reading position', Math.abs(before.top - after) < 12);
  await page.locator('.conversation-scroll').evaluate(element => { element.scrollTop = 0; });
  await page.getByRole('button', { name: /^Load earlier messages/ }).click();
  await until(async () => await page.locator('.conversation-turn').count() === 28);
  check('Every older turn remains accessible on demand', await page.locator(`[data-turn-id="${runIds[0]}"]`).count() === 1);
  await page.getByRole('button', { name: /Jump to latest/ }).click();
  check('Jump to latest follows the newest result', await page.locator('.conversation-scroll').evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight < 3));
  await page.locator('.history-toggle').click();
  await page.getByLabel('Search conversations').fill('orchid-marker');
  check('History searches an earlier message, not only the title', await page.locator('.history-results > button').count() === 1 && await page.locator('.history-results').innerText().then(text => text.includes('Build a greenhouse plan') && text.includes('28 messages')));
  await page.getByLabel('Search conversations').press('Escape');
  check('Escape closes history and restores focus', await page.getByLabel('Conversation history').count() === 0 && await page.locator('.history-toggle').evaluate(element => element === document.activeElement));
  await page.getByLabel('Message Story').fill('Keep this draft while I inspect files.');
  await page.locator('.workspace-tabs').getByRole('button', { name: 'Files', exact: true }).click();
  await page.locator('.workspace-tabs').getByRole('button', { name: 'Conversation', exact: true }).click();
  check('Debounced draft storage flushes when changing sections', await page.getByLabel('Message Story').inputValue() === 'Keep this draft while I inspect files.');
  await page.getByLabel('Message Story').fill('Keep this draft through an immediate reload.');
  await page.reload(); await page.waitForSelector('.overview-dot-card');
  await page.locator('.sidebar-dot').filter({ hasText: 'Story' }).click();
  check('Draft survives an immediate reload', await page.getByLabel('Message Story').inputValue() === 'Keep this draft through an immediate reload.');
  const failure = await page.evaluate(dotId => window.dots.api.startRun(dotId, 'attention-marker', { newSession: true }), dot.id);
  await until(() => page.evaluate(({ dotId, runId }) => window.dots.api.listRuns(dotId, 200).then(runs => runs.find(run => run.id === runId)?.status === 'failed'), { dotId: dot.id, runId: failure.id }));
  await page.locator('.history-toggle').click();
  await page.getByRole('button', { name: 'Needs attention', exact: true }).click();
  check('History filters failed tasks needing attention', await page.locator('.history-results > button').count() === 1 && await page.locator('.history-results').innerText().then(text => text.includes('attention-marker') && text.includes('Needs attention')));
  await page.locator('.history-results > button').click();
  await page.getByLabel('Conversation history').waitFor({ state: 'detached' });
  check('Failure status and real provider error stay visible', await page.locator('.conversation-context').innerText().then(text => text.includes('Needs attention')) && await page.locator('.task-error').innerText().then(text => text.includes('Fixture failure')));
  await page.locator('.history-toggle').click();
  await page.getByLabel('Conversation history').waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.locator('.history-results > button').filter({ hasText: 'Build a greenhouse plan' }).click();
  await until(async () => await page.locator('.conversation-turn').count() === 13);
  await page.locator('.conversation-scroll').evaluate(element => { element.scrollTop = 0; });
  await page.locator('.conversation-turn').first().getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByLabel('Edit your message');
  check('Earlier loaded messages can still be edited', await editor.inputValue() === 'Refine the greenhouse plan, turn 16');
  await editor.fill('A revised greenhouse plan from this point');
  await page.getByRole('button', { name: 'Save & resend', exact: true }).click();
  await until(() => page.evaluate(dotId => window.dots.api.listRuns(dotId, 200).then(runs => runs.some(run => run.prompt === 'A revised greenhouse plan from this point' && run.status === 'succeeded')), dot.id));
  const branch = await page.evaluate(dotId => window.dots.api.listRuns(dotId, 200).then(runs => runs.find(run => run.prompt === 'A revised greenhouse plan from this point')), dot.id);
  check('Editing preserves inherited turns and the original conversation', branch.conversationId !== runIds[0] && branch.prefixRunIds.length === 15 && (await page.evaluate(dotId => window.dots.api.listRuns(dotId, 200), dot.id)).some(run => run.id === runIds[27]));
  await until(async () => await page.locator('.streaming-text').count() === 0 && await page.locator('.final-message').last().innerText().then(text => text.includes('A revised greenhouse plan from this point')));
  check('Completed branches replace the live draft with final Markdown');
  await page.screenshot({ path: join(output, 'conversation-desktop.png') });
  check('No renderer errors', errors.length === 0);
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, errors }, null, 2));
} catch (error) {
  const page = await app.firstWindow();
  await page.screenshot({ path: join(output, 'failure.png') });
  const state = await page.evaluate(async () => {
    const dots = await window.dots.api.getBootstrap();
    const dot = dots.dots.find(dot => dot.name === 'Story');
    const runs = dot ? await window.dots.api.listRuns(dot.id, 200) : [];
    const latest = runs[0];
    const events = latest ? await window.dots.api.getRunEvents(latest.id) : [];
    return { run: latest ? { id: latest.id, status: latest.status, title: latest.title, finalMessage: latest.finalMessage } : null, eventTypes: events.map(event => ({ type: event.type, seq: event.seq, status: event.type === 'status' ? event.status : undefined })), draftText: document.querySelector('.streaming-text')?.textContent, finalCount: document.querySelectorAll('.final-message').length };
  });
  await writeFile(join(output, 'failure.json'), JSON.stringify({ checks, errors, error: error.message, history: await page.locator('.conversation-history').innerText(), state }, null, 2));
  throw error;
} finally {
  await app.evaluate(({ clipboard }) => { clipboard.write(globalThis.__conversationQaClipboardBackup); delete globalThis.__conversationQaClipboardBackup; });
  await app.close();
  await new Promise(done => { server.closeAllConnections(); server.close(done); });
}
