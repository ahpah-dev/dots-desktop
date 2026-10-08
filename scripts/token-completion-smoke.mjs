/** Isolated Electron + fake Codex subprocess regression; no cloud calls or user data. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url), { _electron } = require('playwright');
const output = resolve('artifacts/qa/token-completion');
await mkdir(output, { recursive: true });
const cli = join(output, 'fixture.cjs');
await writeFile(cli, `
const {createInterface}=require('node:readline');
const args=process.argv.slice(2), send=value=>process.stdout.write(JSON.stringify(value)+'\\n');
if(args.includes('--version')) { console.log('codex-cli qa'); process.exit(0); }
if(args.includes('app-server')) {
  createInterface({input:process.stdin}).on('line',line=>{
    const request=JSON.parse(line); if(request.id==null)return;
    const result=request.method==='account/read'?{account:{type:'apiKey'}}:request.method==='model/list'?{data:[{id:'qa-model',model:'qa-model',isDefault:true}],nextCursor:null}:{};
    send({id:request.id,result});
  });
} else {
  let task=''; process.stdin.on('data',value=>task+=value); process.stdin.on('end',()=>{
    send({type:'thread.started',thread_id:'qa-thread'}); send({type:'turn.started'});
    send({type:'item.completed',item:{id:'answer',type:'agent_message',text:'The complete fixture answer is ready.'}});
    if(task.includes('[failure]')) { send({type:'turn.failed',error:{message:'Fixture failed before completion.'}}); setTimeout(()=>process.exit(1),250); }
    else if(task.includes('[slow]')) { setTimeout(()=>process.exit(0),15000); }
    else { send({type:'turn.completed',usage:{input_tokens:90000,output_tokens:700,cached_input_tokens:60000}}); setTimeout(()=>process.exit(0),500); }
  });
}
`);
const executable = join(output, process.platform === 'win32' ? 'codex.cmd' : 'codex');
await writeFile(executable, process.platform === 'win32' ? `@echo off\r\n"${process.execPath}" "${cli}" %*\r\n` : `#!/bin/sh\nexec '${process.execPath}' '${cli}' "$@"\n`, { mode: 0o755 });
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({ executablePath: process.env.DOTS_SMOKE_EXECUTABLE || require('electron'), args: process.env.DOTS_SMOKE_EXECUTABLE ? ['--demo-mode'] : [resolve('.'), '--demo-mode'], env, timeout: 60000 });
const checks = [], errors = [];
const check = (name, condition = true) => { assert.ok(condition, name); checks.push(name); console.log(`PASS ${name}`); };
const until = async predicate => { const end = Date.now() + 25000; while (!(await predicate())) { if (Date.now() > end) throw new Error('Completion regression timed out'); await new Promise(resolve => setTimeout(resolve,100)); } };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.waitForSelector('.overview-dot-card');
  await page.evaluate(async ({ executable, output }) => { await window.dots.api.updateSettings({ codexPathOverride: executable, desktopDotEnabled: false, desktopNotifications: false, defaultWorkspaceRoot: output }); }, { executable, output });
  const auth = await page.evaluate(() => window.dots.api.refreshAuth());
  assert.ok(auth.loggedIn, JSON.stringify(auth));
  await until(() => page.evaluate(executable => window.dots.api.getBootstrap().then(value => value.settings.codexPathOverride === executable && value.auth.loggedIn), executable));
  const dot = await page.evaluate(() => window.dots.api.createDot({ name: 'Completion QA', description: '', color: '#78b7a0', emoji: 'x', instructions: '', providerId: 'codex', model: 'qa-model', permissions: { files:'read', shell:false, web:false, outsideWorkspace:false, approval:'never', talkToDots:false }, budget: { maxMinutes:30, maxSteps:20, maxTokens:1024, workStyle:'economy', enforceLimits:true }, notify:false }));
  await page.locator('.sidebar-dot').filter({ hasText: 'Completion QA' }).click();
  await page.locator('textarea').fill('Return a completed answer.');
  await page.locator('textarea').press('Enter');
  await until(() => page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0]?.status === 'succeeded'), dot.id));
  const done = await page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0]), dot.id);
  check('Real Codex subprocess completes above the token allowance', done.finalMessage === 'The complete fixture answer is ready.' && !done.error && done.usage.inputTokens === 90000);
  await page.waitForSelector('.final-message');
  check('Answer displays once with completion badge', await page.locator('.assistant-message').count() === 1 && await page.locator('.message-complete').count() === 1);
  check('No trailing token cutoff error', !(await page.locator('body').innerText()).includes('Stopped after reaching the task token budget.'));
  await page.reload(); await page.waitForSelector('.sidebar-dot');
  check('Successful answer survives reload', await page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0].status === 'succeeded' && !!runs[0].finalMessage), dot.id));
  const failure = await page.evaluate(id => window.dots.api.startRun(id, '[failure]', { newSession:true }), dot.id);
  await until(() => page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0]?.status === 'failed'), dot.id));
  check('Real failed turns still fail after displayed text', await page.evaluate(id => window.dots.api.getRunEvents(id).then(events => events.some(event => event.type === 'log' && event.text === 'Fixture failed before completion.')), failure.id));
  const slow = await page.evaluate(id => window.dots.api.startRun(id, '[slow]', { newSession:true }), dot.id);
  await until(() => page.evaluate(id => window.dots.api.getRunEvents(id).then(events => events.some(event => event.type === 'message')), slow.id));
  await page.evaluate(id => window.dots.api.cancelRun(id), slow.id);
  await until(() => page.evaluate(id => window.dots.api.listRuns(id).then(runs => runs[0]?.status === 'cancelled'), dot.id));
  check('User cancellation still stops incomplete turns');
  check('No renderer errors', errors.length === 0);
  await writeFile(join(output, 'results.json'), JSON.stringify({ checks, errors, executable: process.env.DOTS_SMOKE_EXECUTABLE || 'development' },null,2));
} finally { await app.close(); }
