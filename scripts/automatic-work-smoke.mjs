/** Packaged UI + real file tools against a deterministic compatible-router fixture. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url), { _electron } = require('playwright');
const output = resolve('artifacts/qa/automatic-work');
await mkdir(output, {recursive:true});
const content = 'A complete deliverable line.\n'.repeat(700), tail = 'Final appended section.\n';
const calls = [], checks = [], errors = [];
const server = createServer(async (req, res) => {
  if (req.method === 'GET') { res.writeHead(200,{'content-type':'application/json'}); res.end(JSON.stringify({data:[{id:'router-model'}]})); return; }
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); calls.push(body);
  const actions = [
    {name:'list_files',args:{}},
    {name:'write_file',args:{path:'deliverable.txt',content}},
    {name:'write_file',args:{path:'deliverable.txt',content:tail,append:true}},
    {name:'read_file',args:{path:'deliverable.txt'}},
  ];
  const action = actions[calls.length - 1];
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({choices:[{message:action?{content:null,tool_calls:[{id:`t${calls.length}`,type:'function',function:{name:action.name,arguments:JSON.stringify(action.args)}}]}:{content:'The deliverable is written and verified.'},finish_reason:action?'tool_calls':'stop'}],usage:{prompt_tokens:160000,completion_tokens:1000}}));
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const app = await _electron.launch({executablePath:process.env.DOTS_SMOKE_EXECUTABLE || require('electron'),args:process.env.DOTS_SMOKE_EXECUTABLE?['--demo-mode']:[resolve('.'),'--demo-mode'],env,timeout:60000});
const check=(name,condition=true)=>{assert.ok(condition,name);checks.push(name);console.log(`PASS ${name}`);};
const until=async predicate=>{const end=Date.now()+25000;while(!(await predicate())){if(Date.now()>end)throw new Error('Automatic-work test timed out');await new Promise(resolve=>setTimeout(resolve,100));}};
try {
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.waitForSelector('.overview-dot-card');
  const dot=await page.evaluate(async ({baseUrl,output})=>{
    await window.dots.api.updateSettings({desktopDotEnabled:false,desktopNotifications:false,defaultWorkspaceRoot:output});
    const provider=await window.dots.api.saveProviderProfile({label:'Compatible router QA',baseUrl,defaultModel:'router-model',requiresKey:false});
    return window.dots.api.createDot({name:'Automatic Work QA',description:'',color:'#78b7a0',emoji:'x',instructions:'',providerId:provider.id,model:'router-model',permissions:{files:'write',shell:false,web:false,outsideWorkspace:false,approval:'never',talkToDots:false},budget:{maxMinutes:30,maxSteps:1,maxTokens:1024,maxContextTokens:1024,maxOutputTokens:128,workStyle:'economy'},notify:false});
  },{baseUrl:`http://127.0.0.1:${server.address().port}/v1`,output});
  await page.locator('.sidebar-dot').filter({hasText:'Automatic Work QA'}).click();
  await page.locator('textarea').fill('Write deliverable.txt and verify the complete file.');
  await page.locator('textarea').press('Enter');
  await until(()=>page.evaluate(id=>window.dots.api.listRuns(id).then(runs=>runs[0]?.status==='succeeded'),dot.id));
  const run=await page.evaluate(id=>window.dots.api.listRuns(id).then(runs=>runs[0]),dot.id);
  check('Five requests complete past old token and one-tool limits',calls.length===5 && run.usage.inputTokens===800000 && !run.error);
  check('Full file and appended content saved on disk',await readFile(join(dot.workspacePath,'deliverable.txt'),'utf8')===content+tail);
  check('Every request keeps tools and uses provider output length',calls.every(call=>call.tools?.some(tool=>tool.function.name==='write_file') && call.max_tokens===undefined && call.max_completion_tokens===undefined));
  await page.waitForSelector('.final-message');
  check('Completed result has no budget cutoff',!(await page.locator('body').innerText()).includes('Wrapped up at the token allowance'));
  await page.getByRole('button',{name:'Profile',exact:true}).click();
  await page.getByRole('button',{name:'Model & computer',exact:true}).click();
  const toggle=page.getByRole('switch',{name:'Enforce custom token & tool limits'});
  check('Custom caps off and inputs disabled by default',await toggle.getAttribute('aria-checked')==='false' && await page.getByLabel('Output per response',{exact:true}).isDisabled());
  await toggle.click();
  check('Custom caps can be explicitly enabled',await page.getByLabel('Output per response',{exact:true}).isEnabled());
  await toggle.click();
  await page.getByRole('button',{name:/Thorough Investigate alternatives/}).click();
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.reload();await page.waitForSelector('.sidebar-dot');
  const saved=await page.evaluate(id=>window.dots.api.getBootstrap().then(value=>value.dots.find(dot=>dot.id===id).budget),dot.id);
  check('Style changes preserve automatic mode after reload',saved.workStyle==='thorough' && saved.enforceLimits===false);
  check('No renderer errors',errors.length===0);
  await writeFile(join(output,'results.json'),JSON.stringify({checks,errors,requests:calls.length,version:await app.evaluate(({app})=>app.getVersion())},null,2));
} finally {await app.close();await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});}
