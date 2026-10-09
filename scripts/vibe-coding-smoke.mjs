/** Real renderer → IPC → provider tools → files → sandboxed preview → refinement. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url), { _electron } = require('playwright');
const output = resolve('artifacts/qa/vibe-coding');
await mkdir(output, { recursive: true });
const html = '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="style.css"></head><body><main><small>MADE WITH DOTS</small><h1>A little more focus.</h1><p>One step at a time. Build something you want to use.</p><button id="add">Add a session</button><output id="count">0</output></main><script src="app.js"></script></body></html>';
const css = 'body{margin:0;background:#f8f6ef;color:#243e32;font:16px system-ui}main{padding:42px 26px;max-width:520px;margin:auto}small{font-size:10px;letter-spacing:2px;color:#75877b}h1{font-size:38px;font-weight:500;letter-spacing:-1px}p{line-height:1.7;color:#6c786f}button{border:0;border-radius:12px;padding:15px 20px;color:white;background:#315a47;cursor:pointer}output{display:block;font-size:64px;margin-top:20px}';
const script = 'let count = 0; document.querySelector("#add").onclick = () => { count += 1; document.querySelector("#count").textContent = count; };';
const command = "$source = Get-Content -LiteralPath 'app.js' -Raw; if (-not $source.Contains('count += 1')) { throw 'Counter regression' }; Write-Output 'Counter verification passed'";
const actions = [
  { name: 'list_files', args: {} },
  { name: 'write_file', args: { path: 'index.html', content: html } },
  { name: 'write_file', args: { path: 'style.css', content: css } },
  { name: 'write_file', args: { path: 'app.js', content: script.replace('+=', '-=') } },
  { name: 'run_command', args: { command } },
  { name: 'write_file', args: { path: 'app.js', content: script } },
  { name: 'run_command', args: { command } },
];
const calls = [], checks = [], errors = [];
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ data: [{ id: 'small-coder' }] })); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); calls.push(body);
  const refinementActions = [
    { name: 'read_file', args: { path: 'style.css' } },
    { name: 'edit_file', args: { path: 'style.css', old_text: 'padding:15px 20px', new_text: 'padding:18px 24px' } },
    { name: 'read_file', args: { path: 'style.css' } },
  ];
  const action = calls.length > 8 ? refinementActions[calls.length - 9] : actions[calls.length - 1];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: action ? { content: null, tool_calls: [{ id: `step${calls.length}`, type: 'function', function: { name: action.name, arguments: JSON.stringify(action.args) } }] } : { content: 'Implemented the app in index.html, style.css and app.js. Fixed the failing counter check and reran it successfully. Select index.html → Preview to try it.' }, finish_reason: action ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 16000, completion_tokens: 100 } }));
});
const devServer = createServer((req, res) => { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Content-Type', req.url === '/app.js' ? 'text/javascript' : req.url === '/style.css' ? 'text/css' : 'text/html'); res.end(req.url === '/app.js' ? script : req.url === '/style.css' ? css : html); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
await new Promise(done => devServer.listen(0, '127.0.0.1', done));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require('electron'), args: process.env.DOTS_SMOKE_EXECUTABLE ? ['--demo-mode'] : [resolve('.'), '--demo-mode'], env, timeout: 60000 });
const check = (name, condition = true) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
const until = async predicate => { const end = Date.now() + 35000; while (!(await predicate())) { if (Date.now() > end) throw new Error('Vibe coding flow timed out'); await new Promise(done => setTimeout(done, 150)); } };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.overview-dot-card');
  await page.setViewportSize({ width: 1440, height: 920 });
  const dot = await page.evaluate(async ({ baseUrl, output }) => {
    await window.dots.api.updateSettings({ desktopDotEnabled: false, desktopNotifications: false, defaultWorkspaceRoot: output });
    const provider = await window.dots.api.saveProviderProfile({ label: 'Coding QA', baseUrl, defaultModel: 'small-coder', requiresKey: false });
    return window.dots.api.createDot({ name: 'Builder', description: 'Build, check, and refine your next idea.', color: '#78b7a0', emoji: 'x', instructions: '', providerId: provider.id, model: 'small-coder', permissions: { files: 'write', shell: true, web: false, outsideWorkspace: false, approval: 'never', talkToDots: false }, budget: { maxMinutes: 30, maxSteps: 1, maxTokens: 1024, maxContextTokens: 1024, maxOutputTokens: 128, workStyle: 'economy' }, notify: false });
  }, { baseUrl: `http://127.0.0.1:${server.address().port}/v1`, output });
  await page.locator('.sidebar-dot').filter({ hasText: 'Builder' }).click();
  check('One conversation tab and no separate Build tab', await page.locator('.workspace-tabs').getByRole('button', { name: 'Conversation', exact: true }).count() === 1 && await page.locator('.workspace-tabs').getByRole('button', { name: 'Build', exact: true }).count() === 0);
  check('Project panel closed by default', await page.getByLabel('Coding workspace', { exact: true }).count() === 0);
  await page.getByRole('button', { name: 'Open project panel', exact: true }).click();
  await page.getByLabel('Message Builder').fill('Build a polished session counter with a button that adds a session.');
  await page.getByLabel('Message Builder').press('Enter');
  await until(() => page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0]?.status === 'succeeded'), dot.id));
  check('Implemented, repaired, and verified past old one-step limits', calls.length === 8);
  check('Real generated file contains the repair', await readFile(join(dot.workspacePath, 'app.js'), 'utf8') === script);
  check('Every compatible request has coding guidance and unrestricted tools', calls.every(call => JSON.stringify(call.messages).includes('Smaller models should follow the same') && call.tools.some(tool => tool.function.name === 'write_file') && !('max_tokens' in call)));
  await page.locator('.build-file-list button').filter({ hasText: 'index.html' }).click();
  await page.locator('.build-file-filters').getByRole('button', { name: /^Changed/ }).click();
  check('Changed files appear next to the conversation', await page.locator('.build-file-list button').count() === 3);
  check('Failed and repaired command results are honest', (await page.locator('.build-checks').innerText()).includes('Failed') && (await page.locator('.build-checks').innerText()).includes('Ran successfully'));
  await page.locator('.build-checks details').last().locator('summary').click();
  check('Actual command output is inspectable', (await page.locator('.build-checks').innerText()).includes('Counter verification passed'));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  const frame = page.frameLocator('iframe[title="App preview"]');
  await until(() => frame.getByRole('button', { name: 'Add a session' }).evaluate(element => typeof element.onclick === 'function' && getComputedStyle(element).backgroundColor === 'rgb(49, 90, 71)'));
  await frame.getByRole('button', { name: 'Add a session' }).click();
  await until(() => frame.locator('output').innerText().then(value => value === '1'));
  check('HTML, local CSS, and JavaScript run in interactive preview', await frame.locator('output').innerText() === '1' && await frame.locator('button').evaluate(el => getComputedStyle(el).backgroundColor) === 'rgb(49, 90, 71)');
  check('Generated app cannot reach Dots IPC or parent DOM', await frame.locator('body').evaluate(() => { let isolated = false; try { void parent.document.body; } catch { isolated = true; } return isolated && typeof window.dots === 'undefined'; }));
  await page.getByRole('button', { name: 'Mobile preview', exact: true }).click();
  check('Mobile preview fits its pane', await page.locator('iframe').evaluate(el => el.getBoundingClientRect().width <= 390));
  await page.getByRole('button', { name: 'Reference selected file', exact: true }).click();
  await page.getByLabel('Message Builder').fill('Make the session button easier to find.');
  await page.getByRole('button', { name: 'Close project panel', exact: true }).click();
  check('Closing project panel preserves prompt and references', await page.getByLabel('Message Builder').inputValue() === 'Make the session button easier to find.' && await page.getByLabel('Referenced files').innerText() === 'index.html');
  await page.getByRole('button', { name: 'Open project panel', exact: true }).click();
  await page.locator('.sidebar-dot').filter({ hasText: 'Willow' }).click();
  check('Opening a project for one Dot does not add it to other Dots', await page.getByLabel('Coding workspace', { exact: true }).count() === 0 && await page.locator('.workspace-tabs').getByRole('button', { name: 'Build', exact: true }).count() === 0);
  await page.locator('.sidebar-dot').filter({ hasText: 'Builder' }).click();
  check('Panel state belongs to its own Dot', await page.getByLabel('Coding workspace', { exact: true }).count() === 1);
  check('Switching Dots keeps exactly one conversation and composer', await page.locator('.dot-primary').count() === 1 && await page.locator('.composer textarea').count() === 1);
  await page.getByRole('button', { name: 'Close project panel', exact: true }).click();
  await page.getByRole('button', { name: 'Browse workspace files', exact: true }).click();
  check('Composer folder opens the optional project panel', await page.getByLabel('Coding workspace', { exact: true }).count() === 1);
  await page.getByRole('button', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'Conversation', exact: true }).click();
  check('Draft survives inspecting other Dot sections', await page.getByLabel('Message Builder').inputValue() === 'Make the session button easier to find.');
  await page.getByLabel('Message Builder').press('Enter');
  await until(() => calls.length >= 9);
  const refinement = JSON.stringify(calls[8].messages);
  check('Refinement keeps conversation and sends current file references', refinement.includes('Build a polished session counter') && refinement.includes('Workspace file references') && refinement.includes('index.html'));
  await until(() => page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0]?.status === 'succeeded'), dot.id));
  check('Refinement edits and verifies the actual CSS', (await readFile(join(dot.workspacePath, 'style.css'), 'utf8')).includes('padding:18px 24px') && calls.length === 12);
  await page.locator('.build-file-list button').filter({ hasText: 'index.html' }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('button', { name: 'Dev server', exact: true }).click();
  await page.getByLabel('Local dev server URL').fill(`http://127.0.0.1:${devServer.address().port}`);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await frame.getByRole('button', { name: 'Add a session' }).click();
  check('Explicit local dev server supports the preview flow', await frame.locator('output').innerText() === '1');
  await page.getByLabel('Disconnect dev server').click();
  await page.screenshot({ path: join(output, 'build-desktop.png') });
  await page.setViewportSize({ width: 900, height: 920 });
  await page.screenshot({ path: join(output, 'build-narrow.png') });
  check('Narrow window has no page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  check('No renderer errors', errors.length === 0);
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, errors, requests: calls.length, version: await app.evaluate(({ app }) => app.getVersion()) }, null, 2));
} finally {
  await app.close();
  for (const service of [server, devServer]) await new Promise(done => { service.closeAllConnections(); service.close(done); });
}
