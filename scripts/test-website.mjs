/** Real Chromium video playback + responsive motion verification, locally or against the published website. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, extname, sep } from 'node:path';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright');
const root = resolve('.'), site = resolve(root, 'website'), output = resolve(root, 'artifacts/qa/website');
await mkdir(output, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.jpg':'image/jpeg', '.mp4':'video/mp4', '.vtt':'text/vtt', '.ico':'image/x-icon' };
let server;
if (!process.env.DOTS_WEBSITE_URL) {
  server = createServer(async (request, response) => {
    const path = resolve(site, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(request.url, 'http://localhost').pathname));
    if (!path.startsWith(site + sep)) { response.writeHead(403).end(); return; }
    try {
      const file = await stat(path);
      const range = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(Number(range[2]), file.size - 1) : file.size - 1;
      if (start > end) { response.writeHead(416, { 'Content-Range': `bytes */${file.size}` }).end(); return; }
      const headers = { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': end-start+1, 'Accept-Ranges':'bytes' };
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`;
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD') response.end(); else createReadStream(path, { start, end }).pipe(response);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const url = process.env.DOTS_WEBSITE_URL || `http://127.0.0.1:${server.address().port}`;
const fixture = resolve(output, 'browser.cjs');
await writeFile(fixture, `const {app,BrowserWindow}=require('electron');app.disableHardwareAcceleration();app.whenReady().then(()=>{const win=new BrowserWindow({width:1440,height:1100,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});win.loadURL(process.env.DOTS_WEB_TEST_URL)});app.on('window-all-closed',()=>app.quit());`);
const env={...process.env,DOTS_WEB_TEST_URL:url};delete env.ELECTRON_RUN_AS_NODE;
const app=await _electron.launch({executablePath:require('electron'),args:[fixture],env});
const errors=[],checks=[],mediaRequests=[];
const check=(name,value=true)=>{assert.ok(value,name);checks.push(name);console.log(`PASS ${name}`);};
try {
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  const resize = async (width, height) => {
    await app.evaluate(({BrowserWindow}, size) => BrowserWindow.getAllWindows()[0].setContentSize(size.width, size.height), {width, height});
    await page.setViewportSize({width, height});
  };
  const screenshot = async path => {
    await page.evaluate(() => { document.documentElement.style.scrollBehavior='auto'; });
    const encoded = await app.evaluate(async ({BrowserWindow}) => (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
    await writeFile(path, Buffer.from(encoded, 'base64'));
  };
  page.on('response',response=>{if(response.url().includes('dots-demo.mp4'))mediaRequests.push(response.status());});
  await page.waitForSelector('#film-play');await page.waitForLoadState('load');await page.evaluate(()=>document.fonts.ready);
  check('Film waits for user playback and does not download at page load',await page.evaluate(()=>document.querySelector('video').paused && document.querySelector('video').currentTime===0) && mediaRequests.length===0);
  check('Scroll reveal and character motion initialize',await page.evaluate(()=>document.documentElement.classList.contains('motion-ready') && getComputedStyle(document.querySelector('.character-eyes')).animationName.includes('character-blink')));
  check('Large grid and secondary decorations stay static',await page.evaluate(()=>['.world-grid','.character-small','.character-peach','.floating-note','.orbit-label'].every(selector=>getComputedStyle(document.querySelector(selector)).animationName==='none')));
  check('Entrance animations do not blur large text surfaces',await page.evaluate(()=>getComputedStyle(document.querySelector('.hero-copy h1')).filter==='none'));
  await page.locator('.hero-world').dispatchEvent('pointermove',{clientX:650,clientY:250});
  await page.locator('.possibility-card').first().dispatchEvent('pointermove',{clientX:200,clientY:750});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  check('Pointer movement does not update gradient or tilt styles',await page.evaluate(()=>!document.querySelector('.hero-world').style.getPropertyValue('--pointer-x') && !document.querySelector('.possibility-card').style.getPropertyValue('--spot-x')));
  check('Scrolling pauses ambient motion',await page.evaluate(()=>{window.dispatchEvent(new Event('scroll'));return document.documentElement.classList.contains('is-scrolling') && getComputedStyle(document.querySelector('.character-main')).animationPlayState==='paused';}));
  await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scrolling'));
  for(const width of [1440,800,390]) {
    await resize(width,1000);
    check(`No horizontal overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(width===390) check('Mobile has no continuous decorative animation',await page.evaluate(()=>['.character-main','.character-eyes','.character-small','.character-peach'].every(selector=>getComputedStyle(document.querySelector(selector)).animationName==='none') && getComputedStyle(document.querySelector('.film-play-icon'),'::after').animationName==='none'));
  }
  await resize(1440,1100);
  const hello = page.getByRole('button',{name:'Say hello to the researcher dot'});
  await hello.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>!document.documentElement.classList.contains('is-scrolling'));
  await hello.click();
  check('Character greeting plays once and winks',await hello.evaluate(element=>getComputedStyle(element).animationName==='small-hello' && getComputedStyle(element).animationIterationCount==='1' && getComputedStyle(element.lastElementChild).animationName==='dot-wink'));
  await page.waitForFunction(()=>!document.querySelector('button.mini-character').classList.contains('is-greeting'));
  check('Greeting settles without a repeated entrance',await hello.evaluate(element=>getComputedStyle(element).animationName==='none'));
  await hello.focus();await page.keyboard.press('Enter');
  check('Keyboard activation replays the greeting',await hello.evaluate(element=>element.classList.contains('is-greeting')));
  await page.getByRole('heading',{name:'Meet your next teammate in motion.'}).scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('.hero-world').classList.contains('is-resting'));
  check('Offscreen hero animations pause',await page.evaluate(()=>getComputedStyle(document.querySelector('.character-main')).animationPlayState==='paused'));
  await page.waitForFunction(()=>document.querySelector('.film-shell').classList.contains('is-visible'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.film-shell')).opacity === '1');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await screenshot(resolve(output,'demo-desktop.png'));
  await page.evaluate(()=>document.querySelector('video').muted=true);
  await page.getByRole('button',{name:'Play the Dots Desktop demo film'}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.paused && v.readyState>=2 && v.currentTime>0.5;});
  check('Native H.264/AAC film plays with real decoded frames',await page.evaluate(()=>{const v=document.querySelector('video');return Math.abs(v.duration-58)<.2 && v.videoWidth===1280 && v.getVideoPlaybackQuality().totalVideoFrames>0;}));
  check('Player supports range streaming',mediaRequests.some(status=>status===206));
  await page.getByRole('button',{name:/Keep the context/}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return v.currentTime>=21 && v.currentTime<24;});
  check('Chapter navigation seeks and resumes playback');
  await page.evaluate(()=>{const v=document.querySelector('video');v.textTracks[0].mode='showing';});
  await page.waitForFunction(()=>document.querySelector('video').textTracks[0].cues?.length===8);
  check('English captions load all eight scenes');
  await page.evaluate(()=>document.querySelector('video').pause());
  check('Pause control works',await page.evaluate(()=>document.querySelector('video').paused));
  await page.evaluate(()=>{const v=document.querySelector('video');v.textTracks[0].mode='hidden';v.currentTime=0;v.playbackRate=4;return v.play();});
  await page.waitForFunction(()=>document.querySelector('video').ended,{},{timeout:30000});
  check('Entire film decodes through the ending and can replay');
  await page.getByRole('button',{name:/Meet your dots/}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('video');return !v.paused && v.currentTime>=6 && v.currentTime<11;});
  await page.evaluate(()=>document.querySelector('video').pause());
  await page.getByText('Read the film transcript',{exact:false}).click();
  check('Accessible transcript opens',await page.locator('.film-transcript').evaluate(element=>element.open));
  await page.emulateMedia({reducedMotion:'reduce'});
  await resize(390,844);await page.reload();await page.waitForSelector('#film-play');
  check('Reduced motion keeps content visible without automatic motion',await page.evaluate(()=>!document.documentElement.classList.contains('motion-ready') && getComputedStyle(document.querySelector('.hero-copy h1')).animationName==='none'));
  await page.getByRole('button',{name:'Say hello to the builder dot'}).click();
  check('Reduced motion disables character greetings',await page.evaluate(()=>[...document.querySelectorAll('button.mini-character')].every(element=>getComputedStyle(element).animationName==='none' && !element.classList.contains('is-greeting'))));
  await page.locator('#demo-title').scrollIntoViewIfNeeded();
  await screenshot(resolve(output,'demo-mobile.png'));
  await page.evaluate(()=>document.querySelector('video').muted=true);
  await page.getByRole('button',{name:'Play the Dots Desktop demo film'}).click();
  await page.waitForFunction(()=>!document.querySelector('video').paused && document.querySelector('video').currentTime>.2);
  check('Mobile player remains playable with reduced motion');
  await page.evaluate(()=>document.querySelector('video').pause());
  check('No renderer exceptions',errors.length===0);
  await writeFile(resolve(output,'results.json'),JSON.stringify({url,checks,errors,mediaRequests},null,2));
  console.log(JSON.stringify({passed:checks.length,errors}));
} finally {await app.close();if(server)await new Promise(resolve=>server.close(resolve));}
