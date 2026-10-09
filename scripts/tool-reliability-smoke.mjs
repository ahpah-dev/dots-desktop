/** Real desktop → provider fallback/recovery → validated tools → disk and terminal status. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const require = createRequire(import.meta.url), { _electron } = require('playwright');
const output = resolve('artifacts/qa/tool-reliability');
await mkdir(output, { recursive: true });
const requests = [], checks = [], errors = [];
let recoveryStep = 0, deniedStep = 0;
const call = (name, args, id = 'same-id') => ({ name, arguments: args, id });
const server = createServer(async (request, response) => {
  if (request.method === 'GET') { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'tiny-model', capabilities: { tools: false } }] })); return; }
  let raw = ''; for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw); requests.push(body);
  if (body.tools) { response.writeHead(400); response.end(JSON.stringify({ error: { message: 'This model does not support tool calling' } })); return; }
  const prompt = body.messages.filter(message => message.role === 'user' && !message.content?.startsWith('Actual Dots tool result')).at(-1)?.content ?? '';
  let envelope;
  if (prompt.includes('denied.txt')) envelope = deniedStep++ ? { final: 'The requested write was blocked.' } : { tool_calls: [call('write_file', { path: 'denied.txt', content: 'must not appear' })] };
  else if (prompt.includes('missing.txt')) envelope = { final: 'Done!' };
  else if (prompt.includes('2 + 2')) envelope = { final: '4' };
  else {
    const append = call('write_file', { path: 'result.txt', content: 'Written exactly once.\n', append: true });
    const sequence = [
      { tool_calls: [call('write_file', null)] },
      { tool_calls: [call('write_file', { path: 'result.txt' })] },
      { tool_calls: [append, { ...append, id: 'duplicate' }] },
      { final: 'Saved and verified.' },
      { tool_calls: [append, call('read_file', { path: 'result.txt' }, 'read')] },
      { final: 'Saved the actual file and checked it.' },
    ];
    envelope = sequence[recoveryStep++];
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(envelope) }, finish_reason: 'stop' }], usage: { prompt_tokens: 16000, completion_tokens: 100 } }));
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require('electron'), args: process.env.DOTS_SMOKE_EXECUTABLE ? ['--demo-mode'] : [resolve('.'), '--demo-mode'], env, timeout: 60000 });
const check = (name, value = true) => { assert.ok(value, name); checks.push(name); console.log(`PASS ${name}`); };
const until = async predicate => { const end = Date.now() + 30000; while (!(await predicate())) { if (Date.now() > end) throw new Error('Tool reliability smoke timed out'); await new Promise(done => setTimeout(done, 100)); } };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.overview-dot-card');
  const dot = await page.evaluate(async ({ baseUrl, output }) => {
    await window.dots.api.updateSettings({ desktopDotEnabled: false, desktopNotifications: false, defaultWorkspaceRoot: output });
    const provider = await window.dots.api.saveProviderProfile({ label: 'Tool recovery QA', baseUrl, defaultModel: 'tiny-model', requiresKey: false });
    return window.dots.api.createDot({ name: 'Recovery QA', description: '', color: '#78b7a0', emoji: '', instructions: '', providerId: provider.id, model: 'tiny-model', permissions: { files: 'write', shell: false, web: false, outsideWorkspace: false, approval: 'never', talkToDots: false }, budget: { maxMinutes: 30, maxSteps: 1, maxTokens: 1024, maxContextTokens: 6000, maxOutputTokens: 128, workStyle: 'economy' }, notify: false });
  }, { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, output });
  await page.locator('.sidebar-dot').filter({ hasText: 'Recovery QA' }).click();
  const send = async (prompt, count, terminal = 'succeeded') => {
    await page.getByLabel('Message Recovery QA').fill(prompt); await page.getByLabel('Message Recovery QA').press('Enter');
    await until(() => page.evaluate(({ id, count, terminal }) => window.dots.api.listRuns(id).then(runs => runs.length === count && runs[0].status === terminal), { id: dot.id, count, terminal }));
    return page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0]), dot.id);
  };
  const run = await send('Write result.txt and verify the actual file.', 1);
  check('Unsupported tiny model completes through validated JSON fallback', run.status === 'succeeded' && recoveryStep === 6 && requests.length === 7);
  check('Malformed arguments recover before execution', requests[3].messages.some(message => message.content?.includes('Missing required argument')));
  check('Duplicate and replayed appends run once', await readFile(join(dot.workspacePath, 'result.txt'), 'utf8') === 'Written exactly once.\n');
  check('Missed verification triggers a real read', requests[5].messages[0].content.includes('Files changed since the last read/check'));
  check('Automatic mode retains the old one-step/1024-token settings without enforcing them', run.usage.inputTokens > 1024 && requests.every(request => !request.max_tokens && !request.max_completion_tokens));
  check('Protocol arguments stay out of streamed drafts', !(await page.locator('body').innerText()).includes('"tool_calls":'));
  await send('What is 2 + 2?', 2);
  check('Ordinary answers do not force file changes', await readFile(join(dot.workspacePath, 'result.txt'), 'utf8') === 'Written exactly once.\n');
  await page.evaluate(id => window.dots.api.updateDot(id, { permissions: { files: 'write', shell: false, web: false, outsideWorkspace: false, approval: 'never', talkToDots: false, rules: [{ id: 'deny-write', action: 'write_file', effect: 'deny', pattern: 'denied.txt' }] } }), dot.id);
  const denied = await send('Write denied.txt.', 3);
  check('Custom denial is preserved through fallback', denied.finalMessage.includes('Blocked by the custom permission rule') && !(await stat(join(dot.workspacePath, 'denied.txt')).catch(() => null)));
  const failed = await send('Write missing.txt.', 4, 'failed');
  check('Repeated hallucinated completion becomes a visible failed run', failed.error.includes('after recovery') && !(await stat(join(dot.workspacePath, 'missing.txt')).catch(() => null)));
  await page.waitForFunction(() => document.body.innerText.includes('after recovery'));
  check('Recovery failure is visible in the conversation');
  check('No renderer exceptions', errors.length === 0);
  await page.screenshot({ path: join(output, 'recovery.png') });
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, errors, requests: requests.length, version: await app.evaluate(({ app }) => app.getVersion()) }, null, 2));
} finally { await app.close(); await new Promise(done => { server.closeAllConnections(); server.close(done); }); }
