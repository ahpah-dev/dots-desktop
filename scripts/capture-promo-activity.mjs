/** Record real v2.0.4 renderer frames and native companion updates with isolated example work. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startQaProvider } from './qa-provider.mjs';
const require=createRequire(import.meta.url), {_electron}=require('playwright');
const output=resolve('artifacts/qa/promo-footage');
await mkdir(output,{recursive:true});
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const provider=await startQaProvider({promotional:true,chunkDelayMs:20});
const app=await _electron.launch({executablePath:require('electron'),args:[resolve('.'),'--demo-mode'],env});
const errors=[];
async function until(fn){const deadline=Date.now()+30000;while(Date.now()<deadline){if(await fn())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out waiting for actual film activity');}
async function capture(name,widget,rect){
  const directory=resolve(output,name);await mkdir(directory,{recursive:true});
  const frames=[],started=performance.now();
  while(performance.now()-started<9000){
    const at=(performance.now()-started)/1000;
    const encoded=await app.evaluate(async({BrowserWindow},{widget,rect})=>{
      const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('widget.html')===widget);
      return (await win.webContents.capturePage(rect)).toPNG().toString('base64');
    },{widget,rect});
    const file=`${String(frames.length).padStart(4,'0')}.png`;
    await writeFile(resolve(directory,file),Buffer.from(encoded,'base64'));frames.push({at,file});
    await new Promise(r=>setTimeout(r,Math.max(0,50-(performance.now()-started-at*1000))));
  }
  await writeFile(resolve(directory,'frames.json'),JSON.stringify({name,duration:9,frames},null,2));
  console.log(`Captured ${frames.length} live ${name} frames.`);
}
try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.waitForSelector('.overview-dot-card');
  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows()[0];win.setContentSize(1220,800);win.focus();});
  const dot=await page.evaluate(async baseUrl=>{
    await window.dots.api.updateSettings({theme:'light',desktopNotifications:false,desktopDotEnabled:true,desktopDotMode:'background'});
    const profile=await window.dots.api.saveProviderProfile({label:'Example workspace',baseUrl,defaultModel:'qa-model',apiKey:'local-example'});
    return window.dots.api.createDot({name:'Clover',description:'A little help with your project’s next step.',instructions:'Keep the brief clear and concise.',color:'#78b7a0',emoji:'🌱',avatar:{shape:'blob',eyes:'dot',glasses:'none',accessory:'sprout'},providerId:profile.id,model:'qa-model',notify:false,permissions:{files:'write',shell:true,web:false,outsideWorkspace:false,approval:'never'}});
  },provider.baseUrl);
  await page.locator('.sidebar-dot').filter({hasText:'Clover'}).click();
  await page.waitForSelector('.dot-body');
  const bounds=await page.locator('.dot-body').boundingBox();
  const rect={x:Math.ceil(bounds.x),y:Math.ceil(bounds.y),width:Math.floor(bounds.width),height:Math.min(610,Math.floor(bounds.height))};
  await page.mouse.move(3,3);
  await page.getByRole('textbox',{name:'Message Clover'}).fill('Draft a release brief, check the workspace, and keep the next step moving.');
  await page.getByRole('textbox',{name:'Message Clover'}).press('Enter');
  await capture('activity',false,rect);
  await until(()=>page.evaluate(async id=>(await window.dots.api.listRuns(id))[0]?.status==='succeeded',dot.id));
  const first=await page.evaluate(async id=>window.dots.api.getRunEvents((await window.dots.api.listRuns(id))[0].id),dot.id);
  assert.ok(first.some(e=>e.type==='tool'&&e.category==='file'&&e.status==='ok'));
  assert.ok(first.some(e=>e.type==='tool'&&e.category==='shell'&&e.status==='ok'));
  const run=await page.evaluate(id=>window.dots.api.startRun(id,'Check the project and prepare the next useful step.',{newSession:true}),dot.id);
  await page.evaluate(()=>window.dots.window.control('minimize'));
  await until(async()=>app.windows().some(p=>p.url().includes('widget.html')));
  const widget=app.windows().find(p=>p.url().includes('widget.html'));widget.on('pageerror',e=>errors.push(e.message));
  await widget.waitForSelector('.widget-bubble');
  await until(async()=>(await widget.evaluate(()=>window.desktopDot.getState())).runId===run.id);
  await app.evaluate(({BrowserWindow,screen})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('widget.html'));const area=screen.getPrimaryDisplay().workArea;win.setSize(720,384);win.setPosition(area.x+100,area.y+100);win.webContents.setZoomFactor(2);});
  await widget.evaluate(()=>{document.body.style.background='#e8eddf';});
  await capture('desktop',true);
  const state=await widget.evaluate(()=>window.desktopDot.getState());assert.equal(state.activity,'done');
  assert.equal(errors.length,0);
  await writeFile(resolve(output,'verification.json'),JSON.stringify({version:'2.0.4',actualFileWrite:true,actualCommand:true,desktopRunId:run.id,desktopCompleted:true,errors},null,2));
  console.log('Captured actual activity and desktop companion footage, with no renderer errors.');
}finally{await app.close();await provider.close();}
