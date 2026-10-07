/** Deterministic promotional film: original motion graphics + actual app footage + original synth score. */
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import ffmpeg from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sceneTiming, SCENE_STARTS } from './promo-timeline.mjs';

const WIDTH = 1280, HEIGHT = 720, FPS = 30, DURATION = SCENE_STARTS.at(-1);
const output = resolve('website/assets');
const scratch = resolve('artifacts/qa/promo');
await mkdir(scratch, { recursive: true });
for (const [file, family] of [['C:/Windows/Fonts/segoeui.ttf', 'Film'], ['C:/Windows/Fonts/seguisb.ttf', 'Film Semi']]) {
  if (existsSync(file)) GlobalFonts.registerFromPath(file, family);
}
const images = {};
for (const name of ['overview', 'conversation', 'memory', 'responsibilities', 'profile']) {
  images[name] = await loadImage(resolve(output, `demo/${name}.png`));
}
const clips={};
for(const name of ['activity','desktop']) {
  const directory=resolve('artifacts/qa/promo-footage',name);
  const metadata=JSON.parse(await readFile(resolve(directory,'frames.json'),'utf8'));
  clips[name]=await Promise.all(metadata.frames.map(async frame=>({...frame,image:await loadImage(resolve(directory,frame.file))})));
}
function footage(name,time) { const frames=clips[name];return (frames.findLast(frame=>frame.at<=Math.max(0,time))??frames[0]).image; }
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
const clamp = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
const ink = '#28382f', green = '#35785c', paper = '#f8f9f5';

function roundRect(x, y, w, h, radius, fill, stroke) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}
function text(str, x, y, size, color = ink, weight = 'regular', align = 'left') {
  ctx.font = `${size}px "${weight === 'semi' ? 'Film Semi' : 'Film'}", sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}
function lines(items, x, y, size, color, time, gap = size * 1.16) {
  items.forEach((line, i) => {
    const p = ease((time - .18 - i * .14) / .85);
    ctx.save(); ctx.globalAlpha *= p;
    text(line, x, y + i * gap + (1 - p) * 24, size, color, 'semi'); ctx.restore();
  });
}
function logo(x, y, size) {
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 64, size / 64);
  roundRect(4, 4, 56, 56, 16, green);
  [[22,22,paper],[42,22,paper],[22,42,'#c5dcc8'],[42,42,'#99c6ad']].forEach(([cx,cy,c]) => {
    ctx.beginPath(); ctx.arc(cx,cy,7.5,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();
  });ctx.restore();
}
function character(x, y, size, color, time, tilt = -.08, happy = false) {
  ctx.save(); ctx.translate(x,y + Math.sin(time * 1.7) * 8);ctx.rotate(tilt + Math.sin(time * .8) * .025);
  const glow=ctx.createRadialGradient(-size*.15,-size*.2,0,0,0,size*.7);
  glow.addColorStop(0,color);glow.addColorStop(1,color === '#bbd0a8' ? '#9fbf8b' : color);
  ctx.shadowColor='#182d2319';ctx.shadowBlur=34;ctx.shadowOffsetY=18;
  roundRect(-size/2,-size/2,size,size,size*.43,glow);ctx.shadowColor='transparent';
  ctx.fillStyle=ink;
  const blink = time % 5.4 > 5.12 ? .15 : 1;
  for (const ex of [-.105,.105]) {
    if (happy) {ctx.beginPath();ctx.arc(size*ex,-size*.04,size*.035,Math.PI,Math.PI*2);ctx.strokeStyle=ink;ctx.lineWidth=size*.014;ctx.stroke();}
    else roundRect(size*ex-size*.022,-size*.08,size*.044,size*.075*blink,size*.025,ink);
  }
  ctx.beginPath();ctx.arc(0,size*.07,size*.048,0,Math.PI);ctx.lineWidth=size*.012;ctx.strokeStyle=ink;ctx.stroke();
  ctx.fillStyle='#90aa6a35';for(const ex of [-.2,.2]){ctx.beginPath();ctx.ellipse(size*ex,size*.035,size*.06,size*.03,0,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function background(time, dark = false) {
  ctx.fillStyle=dark?'#233f31':paper;ctx.fillRect(0,0,WIDTH,HEIGHT);
  const glow=ctx.createRadialGradient(1000,320,20,1000,320,670);
  glow.addColorStop(0,dark?'#62865d40':'#d6e6ca90');glow.addColorStop(1,dark?'#233f3100':'#f8f9f500');
  ctx.fillStyle=glow;ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle=dark?'#b8d3ad14':'#8fa38014';
  for(let x=650;x<1300;x+=28)for(let y=25;y<730;y+=28){ctx.beginPath();ctx.arc(x+Math.sin(time*.2+y)*2,y,1.2,0,Math.PI*2);ctx.fill();}
}
function badge(label, x, y, time, dark=false) {
  const p=ease((time-.5)/.7);ctx.save();ctx.globalAlpha*=p;
  const yy=y+(1-p)*16;
  roundRect(x,yy,298,48,14,dark?'#ffffff14':'#fffefa','#839e6c22');
  ctx.beginPath();ctx.arc(x+25,yy+24,9,0,Math.PI*2);ctx.fillStyle=dark?'#a7c89b':'#dfead6';ctx.fill();
  text('✓',x+25,yy+28,12,green,'semi','center');text(label,x+45,yy+29,14,dark?paper:'#536c53');ctx.restore();
}
const products = [
  null,
  { title:['Your team.','One home.'], subtitle:['A researcher. A builder.','A keeper of the details.'], image:'overview', tag:'YOUR PERSONAL TEAM', note:'A purpose for every teammate.' },
  { title:['Hand over','the next thing.'], subtitle:['Give your dot a brief.','See the work. Pick up the conversation.'], image:'conversation', tag:'FROM A BRIEF TO PROGRESS', note:'Your conversation carries forward.' },
  { title:['Know what','your dot','is doing.'], subtitle:['Files. Web searches. Commands.','Little motions. Clear live updates.'], image:'activity', tag:'NEW IN 2.0.4 · WORK IN MOTION', note:'See each step as it happens.' },
  null,
  { title:['Less repeating.','More remembering.'], subtitle:['Preferences. Decisions. Context.','Memory you can inspect and edit.'], image:'memory', tag:'CONTEXT THAT STAYS CLOSE', note:'Keep the useful details.' },
  { title:['Give the work','a rhythm.'], subtitle:['Ongoing responsibilities.','Recurring checks. Durable follow-ups.'], image:'responsibilities', tag:'THE THINGS YOUR DOT OWNS', note:'Daily, interval, and cron schedules.' },
  { title:['A capable dot.','You in control.'], subtitle:['Choose its tools and permissions.','Review work. Pause when you need to.'], image:'profile', tag:'CLEAR BOUNDARIES', note:'Local work. Reviewable activity.' },
];
function productScene(index, time) {
  const item=products[index];background(time);
  logo(66,44,44);text('dots',118,76,26,ink,'semi');text(item.tag,76,177,12,'#7b9075','semi');
  const baseSize = index === 5 ? 46 : 53;
  ctx.font = `${baseSize}px "Film Semi", sans-serif`;
  const widest = Math.max(...item.title.map(line => ctx.measureText(line).width));
  const titleSize = Math.min(baseSize, baseSize * 345 / widest);
  lines(item.title,76,258,titleSize,ink,time,titleSize * 1.2);
  item.subtitle.forEach((line,i)=>text(line,78,429+i*28,17,'#758477'));
  text(`${String(index+1).padStart(2,'0')} / 10`,78,651,12,'#91a08c');
  if(index===3) activityChips(time);
  const p=ease(time/1.1), x=475+(1-p)*150, y=136 + Math.sin(time*.8)*3;
  const source=item.image==='activity'?footage('activity',time):images[item.image];
  const width=item.image==='activity'?790:858,height=width*source.height/source.width;
  ctx.save();ctx.globalAlpha*=p;ctx.translate(x+width/2,y+height/2);ctx.rotate(-.025 + Math.sin(time*.3)*.003);
  ctx.shadowColor='#36503e24';ctx.shadowBlur=42;ctx.shadowOffsetY=24;
  roundRect(-width/2,-height/2,width,height,14,'white');ctx.shadowColor='transparent';
  ctx.beginPath();ctx.roundRect(-width/2,-height/2,width,height,14);ctx.clip();
  const zoom=1.006+ease(time/8)*.01;
  ctx.drawImage(source,-width*zoom/2,-height*zoom/2,width*zoom,height*zoom);ctx.restore();
  badge(item.note,770,616,time);
}
function activityChips(time) {
  const labels=['Files','Web','Commands'], widths=[95,92,138];let x=76;
  for(let i=0;i<3;i++) {
    const p=ease((time-.6-i*.15)/.7);ctx.save();ctx.globalAlpha*=p;
    roundRect(x,515+(1-p)*12,widths[i],45,12,'#e8efdf');
    ctx.save();ctx.translate(x+22,537+(1-p)*12);ctx.strokeStyle=green;ctx.lineWidth=1.7;ctx.lineCap='round';
    if(i===0){ctx.rotate(Math.sin(time*3)*.12);ctx.beginPath();ctx.moveTo(-6,6);ctx.lineTo(5,-5);ctx.lineTo(8,-2);ctx.lineTo(-3,9);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(-8,10);ctx.lineTo(8,10);ctx.stroke();}
    if(i===1){ctx.rotate(Math.sin(time*2)*.1);ctx.beginPath();ctx.arc(0,0,9,0,Math.PI*2);ctx.moveTo(-9,0);ctx.lineTo(9,0);ctx.ellipse(0,0,4,9,0,0,Math.PI*2);ctx.stroke();}
    if(i===2){roundRect(-11,-9,22,18,4,null,green);ctx.beginPath();ctx.moveTo(-6,-3);ctx.lineTo(-2,0);ctx.lineTo(-6,3);if(time%1.2<.6){ctx.moveTo(1,4);ctx.lineTo(6,4);}ctx.stroke();}
    ctx.restore();text(labels[i],x+40,542+(1-p)*12,13,green,'semi');ctx.restore();x+=widths[i]+8;
  }
}
function desktopScene(time) {
  background(time);logo(66,44,44);text('dots',118,76,26,ink,'semi');
  text('NEW IN 2.0.4 · YOUR DESKTOP DOT',76,177,12,'#7b9075','semi');
  lines(['Still here.','Still on it.'],76,266,55,ink,time,67);
  text('Minimize. Close to the tray.',78,429,17,'#758477');text('Your dot keeps you posted.',78,457,17,'#758477');
  text('05 / 10',78,651,12,'#91a08c');
  const enter=ease(time/1.1);ctx.save();ctx.globalAlpha*=enter;ctx.translate((1-enter)*100,0);
  ctx.shadowColor='#36503e24';ctx.shadowBlur=30;ctx.shadowOffsetY=16;
  roundRect(450,126,768,438,20,'#e8eddf','#d4dfc8');ctx.shadowColor='transparent';
  ctx.beginPath();ctx.roundRect(450,126,768,438,20);ctx.clip();
  text('YOUR DESKTOP',477,155,10,'#829375','semi');
  for(const [i,label] of ['Project','Brief','Notes'].entries()){roundRect(476,180+i*60,48,45,10,'#ffffff70');text(label,500,207+i*60,10,'#829375','regular','center');}
  const minimize=ease((time-.45)/.8);
  if(minimize<1){ctx.save();ctx.globalAlpha*=1-minimize;const w=710*(1-minimize)+30*minimize,h=w*images.conversation.height/images.conversation.width;ctx.drawImage(images.conversation,477+610*minimize,168+350*minimize,w,h);ctx.restore();}
  const appear=ease((time-.9)/.6);ctx.save();ctx.globalAlpha*=appear;
  ctx.drawImage(footage('desktop',time-.9),536,190+(1-appear)*24,648,346);ctx.restore();
  roundRect(465,540,738,16,7,'#ffffff80');logo(1088,539,16);text('Dots is running in the tray',484,551,9,'#829375');ctx.restore();
  badge('Open. Stop. Switch teammates.',757,598,time);
  text('Optional spoken updates',78,530,15,green,'semi');
}
function drawScene(index, time) {
  if(index===4){desktopScene(time);return;}
  if(index>=1&&index<=7){productScene(index,time);return;}
  background(time,index===0||index===9);
  if(index===0){
    logo(70,48,48);text('dots',126,83,28,paper,'semi');text('YOUR WORK, MOVING FORWARD',76,181,12,'#b3ccb0','semi');
    lines(['A little dot.','A lot less on','your plate.'],74,276,66,paper,time,79);
    text('Personal AI teammates. A thoughtful new home.',77,565,18,'#bfd2bf');
    character(982,348,270,'#bbd0a8',time);character(781,177,77,'#d9cde6',time, .15);character(1157,559,70,'#e8cbb0',time,.09);
    badge('Good things are in motion.',803,95,time,true);
    text('DOTS DESKTOP · THE DEMO FILM',77,664,11,'#a6bfa6');
  }else if(index===8){
    text('A TEAM THAT GETS YOUR WORLD',WIDTH/2,104,12,'#899b80','semi','center');
    const labels=['The researcher','The builder','The keeper'];const colors=['#bbd0a8','#e8cbb0','#d9cde6'];
    const purposes=['Get the clear picture.','Make something real.','Keep the important things moving.'];
    for(let i=0;i<3;i++){
      const p=ease((time-i*.24)/.85);ctx.save();ctx.globalAlpha*=p;
      const x=260+i*380;character(x,305+(1-p)*28,180,colors[i],time+i,i*.08-.08,i===0);
      text(labels[i],x,464,25,ink,'semi','center');text(purposes[i],x,507,i===2?16:18,'#758477','regular','center');ctx.restore();
    }
    text('Make room for what matters.',WIDTH/2,627,37,ink,'semi','center');
  }else{
    const p=ease(time/.9);ctx.save();ctx.globalAlpha*=p;
    logo(584,86+(1-p)*22,112);ctx.restore();
    ctx.save();ctx.textAlign='center';
    const titleP=ease((time-.35)/.9);ctx.globalAlpha*=titleP;
    text('Good things',640,302+(1-titleP)*20,68,paper,'semi','center');text('are in motion.',640,384+(1-titleP)*20,68,paper,'semi','center');ctx.restore();
    text('Meet your next teammate.',640,449,21,'#bfd2bf','regular','center');
    roundRect(488,503,304,60,14,paper);text('Meet Dots Desktop  →',640,542,20,ink,'semi','center');
    text('dotsdesktop.vercel.app',640,615,20,'#cee0c8','regular','center');
    text('WINDOWS · YOUR COMPUTER ON, DOTS RUNNING',640,668,11,'#9fb99f','regular','center');
  }
}
function render(time) {
  const { index, localTime, incoming } = sceneTiming(time);
  drawScene(index,localTime);
  if(incoming){
    ctx.save();ctx.globalAlpha=ease(incoming.progress);drawScene(incoming.index,incoming.localTime);ctx.restore();
  }
  const fade=clamp(time/.35)*clamp((DURATION-time)/.6);
  if(fade<1){ctx.fillStyle=`rgba(35,63,49,${1-fade})`;ctx.fillRect(0,0,WIDTH,HEIGHT);}
}

// An original, quiet synth arrangement. No licensed samples or third-party music.
const rate=48000,sampleCount=rate*DURATION,audio=Buffer.alloc(44+sampleCount*4);
audio.write('RIFF',0);audio.writeUInt32LE(audio.length-8,4);audio.write('WAVEfmt ',8);audio.writeUInt32LE(16,16);
audio.writeUInt16LE(1,20);audio.writeUInt16LE(2,22);audio.writeUInt32LE(rate,24);audio.writeUInt32LE(rate*4,28);
audio.writeUInt16LE(4,32);audio.writeUInt16LE(16,34);audio.write('data',36);audio.writeUInt32LE(sampleCount*4,40);
const chords=[[146.832,220,329.628,369.994],[98,146.832,164.814,246.942],[123.471,184.997,220,293.665],[110,164.814,246.942,277.183]];
const beat=60/92;
for(let i=0;i<sampleCount;i++){
  const t=i/rate,ci=Math.floor(t/(beat*16))%4,chord=chords[ci],within=t%(beat*16);
  const padEnvelope=Math.min(1,within/.6)*Math.min(1,(beat*16-within)/.65);
  let left=0,right=0;
  chord.forEach((f,j)=>{left+=Math.sin(2*Math.PI*f*t+j*.7)*.026*padEnvelope;right+=Math.sin(2*Math.PI*(f*1.0006)*t+j*.7)*.026*padEnvelope;});
  const step=Math.floor(t/beat),dt=t%beat,f=chord[step%4]*2;
  const pluck=(Math.sin(2*Math.PI*f*dt)+.15*Math.sin(4*Math.PI*f*dt))*Math.exp(-dt*7)*.045;
  const kick=step%2===0?Math.sin(2*Math.PI*(52*dt+1.2*(1-Math.exp(-dt*22))))*Math.exp(-dt*25)*.07:0;
  const edge=Math.min(1,t/2.5)*Math.min(1,(DURATION-t)/3);
  audio.writeInt16LE(Math.round(Math.max(-.98,Math.min(.98,(left+pluck+kick)*edge*2))*32767),44+i*4);
  audio.writeInt16LE(Math.round(Math.max(-.98,Math.min(.98,(right+pluck+kick)*edge*2))*32767),46+i*4);
}
const score=resolve(scratch,'score.wav');await writeFile(score,audio);
render(33);await writeFile(resolve(output,'demo-poster.jpg'),canvas.encodeSync('jpeg',92));
// Inspect both sides of every cut to catch repeated entrances and flashes.
for (const cut of SCENE_STARTS.slice(1,-1)) {
  for (const offset of [-.4,-1/FPS,0,1/FPS,.4]) {
    render(cut+offset);
    await writeFile(resolve(scratch,`cut-${cut}-${offset.toFixed(3)}.jpg`),canvas.encodeSync('jpeg',92));
  }
}

const encoder=spawn(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','image2pipe','-vcodec','mjpeg','-framerate',String(FPS),'-i','pipe:0','-i',score,'-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-shortest',resolve(output,'dots-demo.mp4')],{windowsHide:true,stdio:['pipe','ignore','pipe']});
let errors='';encoder.stderr.on('data',chunk=>errors+=chunk.toString());
const done=once(encoder,'close');
for(let frame=0;frame<DURATION*FPS;frame++){
  render(frame/FPS);
  if(!encoder.stdin.write(canvas.encodeSync('jpeg',90)))await once(encoder.stdin,'drain');
  if(frame%(FPS*5)===0){console.log(`Rendering promotional film: ${Math.round(frame/(DURATION*FPS)*100)}%`);await writeFile(resolve(scratch,`scene-${Math.round(frame/FPS)}.jpg`),canvas.encodeSync('jpeg',90));}
}
encoder.stdin.end();const [code]=await done;if(code!==0)throw new Error(errors||`FFmpeg exited ${code}`);
await writeFile(resolve(output,'dots-demo.vtt'),`WEBVTT

00:00.000 --> 00:06.000
A little dot. A lot less on your plate.
Personal AI teammates. A thoughtful new home.

00:06.000 --> 00:13.000
Your team. One home.
A researcher. A builder. A keeper of the details.

00:13.000 --> 00:21.000
Hand over the next thing.
Give your dot a brief. See the work. Pick up the conversation.

00:21.000 --> 00:30.000
Know what your dot is doing.
File work, web searches, and commands
have clear, gentle activity animations.

00:30.000 --> 00:39.000
Still here. Still on it.
Your desktop dot shares live updates when minimized or closed to the tray.
Open, stop, switch teammates, or enable spoken updates.

00:39.000 --> 00:46.000
Less repeating. More remembering.
Preferences, decisions, and context. Memory you can inspect and edit.

00:46.000 --> 00:54.000
Give the work a rhythm.
Ongoing responsibilities, recurring checks, and durable follow-ups.

00:54.000 --> 01:01.000
A capable dot. You in control.
Choose tools and permissions. Review work. Pause when you need to.

01:01.000 --> 01:08.000
The researcher. The builder. The keeper.
Make room for what matters.

01:08.000 --> 01:16.000
Good things are in motion. Meet your next teammate.
Dots Desktop. Your computer must be on and Dots running.
`);
console.log(`Created ${DURATION}s 1280×720 H.264/AAC promotional film, poster, and captions.`);
