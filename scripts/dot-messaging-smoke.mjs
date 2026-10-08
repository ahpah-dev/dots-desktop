/** Actual Electron → tools → teammate task → queued reply → conversation rendering. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url), { _electron } = require('playwright');
const calls = [];
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'qa-model' }] })); return; }
  let raw = ''; for await (const part of req) raw += part;
  const body = JSON.parse(raw), system = body.messages[0].content;
  const lastUser = body.messages.findLastIndex(m => m.role === 'user');
  const results = body.messages.slice(lastUser + 1).filter(m => m.role === 'tool');
  calls.push(body);
  let tool, text;
  if (system.includes('## Incoming teammate request')) text = 'Verified: the project brief needs a source and a clear next step.';
  else if (system.includes('## Incoming teammate reply')) text = 'Brief completed using Researcher’s verified facts and suggested next step.';
  else if (!results.length) tool = { name: 'list_dots', args: {} };
  else if (results.length === 1) tool = { name: 'send_dot_message', args: { dot_id: JSON.parse(results[0].content).find(dot => dot.name === 'Researcher').id, message: 'Check the facts for my project brief and suggest the next step.' } };
  else text = 'I asked Researcher to check the facts. Its reply will arrive here.';
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const delta = tool ? { tool_calls: [{ index: 0, id: `qa-${calls.length}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } : { content: text };
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }] })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const defaultWorkspaces = resolve('artifacts/qa/messaging-default-workspaces');
await mkdir(defaultWorkspaces, { recursive: true });
const app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require('electron'), args: process.env.DOTS_SMOKE_EXECUTABLE ? ['--demo-mode'] : [resolve('.'), '--demo-mode'], env, timeout: 60000 });
const until = async fn => { const deadline = Date.now() + 20000; while (Date.now() < deadline) { if (await fn()) return; await new Promise(r => setTimeout(r, 100)); } throw new Error('Timed out waiting for teammate conversation'); };
try {
  const page = await app.firstWindow(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.waitForSelector('.overview-dot-card');
  await page.evaluate(defaultWorkspaceRoot => window.dots.api.updateSettings({ defaultWorkspaceRoot }), defaultWorkspaces);
  const dots = await page.evaluate(async baseUrl => {
    await window.dots.api.updateSettings({ theme: 'light', maxConcurrentRuns: 1, desktopDotEnabled: false });
    for (const dot of (await window.dots.api.getBootstrap()).dots) {
      await window.dots.api.updateDot(dot.id, { permissions: { ...dot.permissions, talkToDots: false } });
    }
    const provider = await window.dots.api.saveProviderProfile({ label: 'Messaging QA', baseUrl, defaultModel: 'qa-model', apiKey: 'fixture' });
    const create = name => window.dots.api.createDot({ name, description: `${name} project support`, instructions: 'Use a teammate when helpful.', color: '#78b7a0', emoji: '🌱', providerId: provider.id, model: 'qa-model', notify: false, permissions: { files: 'read', shell: false, web: false, outsideWorkspace: false, approval: 'never' } });
    return [await create('Writer'), await create('Researcher')];
  }, `http://127.0.0.1:${server.address().port}/v1`);
  for (const dot of dots) {
    assert.equal(dot.permissions.talkToDots, true);
    await page.locator('.sidebar-dot').filter({ hasText: dot.name }).click();
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Permissions', exact: true }).click();
    const toggle = page.getByRole('switch', { name: 'Talk to other dots' });
    assert.equal(await toggle.getAttribute('aria-checked'), 'true');
  }
  console.log('PASS both dots can talk by default without changing permissions');
  await page.locator('.sidebar-dot').filter({ hasText: 'Writer' }).click();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message Writer' }).fill('Ask Researcher to check the facts, then finish my brief.');
  await page.getByRole('textbox', { name: 'Message Writer' }).press('Enter');
  await until(() => page.evaluate(async id => (await window.dots.api.listRuns(id)).some(r => r.dotMessage?.kind === 'reply' && r.status === 'succeeded'), dots[0].id));
  await page.getByText('Reply from Researcher', { exact: true }).waitFor();
  await page.getByText('Brief completed using Researcher’s verified facts and suggested next step.', { exact: true }).waitFor();
  const runs = await page.evaluate(async ids => Promise.all(ids.map(id => window.dots.api.listRuns(id))), dots.map(d => d.id));
  const root = runs[0].find(r => r.trigger === 'manual'), reply = runs[0].find(r => r.dotMessage?.kind === 'reply');
  assert.equal(reply.conversationId, root.conversationId);
  assert.equal(runs[1][0].dotMessage.sourceDotName, 'Writer');
  assert.ok(calls.some(body => body.messages.some(m => m.role === 'tool' && m.content.includes('Message queued for Researcher'))));
  assert.ok(calls.some(body => body.messages[0].content.includes('Incoming teammate reply') && body.messages.some(m => m.role === 'user' && m.content.includes('finish my brief'))));
  await mkdir(resolve('artifacts/qa'), { recursive: true });
  await page.screenshot({ path: resolve('artifacts/qa/dot-messaging-reply.png') });
  console.log('PASS actual messaging tools, one-slot queue, automatic reply and original task history');
  await page.locator('.sidebar-dot').filter({ hasText: 'Researcher' }).click();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  await page.getByText('Message from Writer', { exact: true }).waitFor();
  assert.equal(await page.locator('.teammate-message .message-actions').count(), 0);
  await page.screenshot({ path: resolve('artifacts/qa/dot-messaging-request.png') });
  assert.deepEqual(errors, []);
  console.log('PASS recipient sender label, no user edit controls, and no renderer errors');
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  await page.getByRole('switch', { name: 'Talk to other dots' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await until(() => page.evaluate(async id => (await window.dots.api.getBootstrap()).dots.find(d => d.id === id).permissions.talkToDots === false, dots[1].id));
  await page.reload();
  await page.waitForSelector('.sidebar-dot');
  await page.locator('.sidebar-dot').filter({ hasText: 'Researcher' }).click();
  await page.getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Permissions', exact: true }).click();
  assert.equal(await page.getByRole('switch', { name: 'Talk to other dots' }).getAttribute('aria-checked'), 'false');
  console.log('PASS turning messaging off persists across reloads');
  await page.keyboard.press('Control+n');
  const dialog = page.getByRole('dialog', { name: 'Meet your new dot', exact: true }); await dialog.waitFor();
  await dialog.getByLabel('Name', { exact: true }).fill('Default Messaging QA');
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create Default Messaging QA', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const created = (await page.evaluate(() => window.dots.api.getBootstrap())).dots.find(dot => dot.name === 'Default Messaging QA');
  assert.equal(created.permissions.talkToDots, true);
  console.log('PASS dots created through the new Dot dialog can talk by default');
} finally { await app.close(); await new Promise(r => { server.closeAllConnections(); server.close(r); }); }
