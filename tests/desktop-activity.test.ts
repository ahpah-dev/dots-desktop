import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { activeTool, toolActivity, type ToolEvent } from '../src/shared/activity';
import type { DotSummary, Run } from '../src/shared/types';
import { chooseDesktopDot, clampDesktopBounds, desktopActivityState } from '../src/main/desktopActivity';
import { defaultSettings, SettingsStore } from '../src/main/storage/settingsStore';

const settings = defaultSettings('/workspace');
const dot = (id: string, status: DotSummary['status'], lastRunAt=0): DotSummary => ({
  id, status, lastRunAt, name: id, color:'#78b7a0', emoji:'🌱', description:'', instructions:'', providerId:'qa', model:'qa', workspacePath:'/workspace',
  permissions:{files:'write',shell:true,web:true,outsideWorkspace:false,approval:'never'},budget:{maxMinutes:30,maxSteps:60},schedule:null,paused:status==='paused',notify:false,createdAt:1,updatedAt:1
});
const run = (status: Run['status']): Run => ({id:'run',dotId:'writer',trigger:'manual',title:'A task',prompt:'A task',newSession:true,status,createdAt:1});
const tool = (id: string, category: ToolEvent['category'], status: ToolEvent['status']='running', name='run_command'): ToolEvent => ({type:'tool',id,category,name,status,runId:'run',dotId:'writer',seq:1,ts:1});

describe('desktop activity follows actual work',()=>{
  it('prioritizes approval, active work, and recent idle dots, with an explicit pin',()=>{
    const dots=[dot('idle','idle',20),dot('worker','running',10),dot('approval','awaiting-approval',1),dot('queued','queued',30),dot('paused','paused',100)];
    expect(chooseDesktopDot(dots)?.id).toBe('approval');
    expect(chooseDesktopDot(dots,'idle')?.id).toBe('idle');
    expect(chooseDesktopDot(dots,'deleted')?.id).toBe('approval');
    expect(chooseDesktopDot([dot('old','idle',1),dot('new','idle',2)])?.id).toBe('new');
    expect(chooseDesktopDot([])).toBeUndefined();
  });
  it('retires completed tools without losing an overlapping running tool',()=>{
    const a=tool('a','file','running','write_file'),b=tool('b','shell');
    expect(activeTool([a,b,{...b,status:'ok'}])?.id).toBe('a');
    expect(activeTool([a,b,{...b,status:'error'},{...a,status:'ok'}])).toBeUndefined();
    expect(activeTool([a,{...a,status:'ok'},b])?.id).toBe('b');
  });
  it('distinguishes file reads, writes, web searches, and other tool work',()=>{
    expect(toolActivity(tool('a','file','running','read_file')).label).toBe('Reading files');
    expect(toolActivity(tool('a','file','running','edit_file')).label).toBe('Writing files');
    expect(toolActivity(tool('a','search','running','web_search')).kind).toBe('web');
    for(const category of ['file','shell','web','search','memory','mcp','other'] as const) expect(toolActivity(tool('a',category)).caption).toBeTruthy();
  });
  it('shows tool activity only during running tasks and keeps raw tool content private',()=>{
    const events=[{...tool('cmd','shell'),input:'SECRET_KEY=private',output:'private output'}];
    const working=desktopActivityState(dot('writer','running'),run('running'),events,settings,1,false,false);
    expect(working.activity).toBe('shell');expect(working.canStop).toBe(true);
    expect(JSON.stringify(working)).not.toContain('private');
    expect(desktopActivityState(dot('writer','idle'),run('succeeded'),events,settings,1,false,false).activity).toBe('done');
    expect(desktopActivityState(dot('writer','running'),run('running'),[],settings,1,false,false).activity).toBe('thinking');
  });
  it('represents approval, queue, pause, errors, cancellation, and empty state',()=>{
    expect(desktopActivityState(dot('writer','awaiting-approval'),run('running'),[],settings,1,false,false).activity).toBe('approval');
    expect(desktopActivityState(dot('writer','queued'),run('queued'),[],settings,1,false,false).activity).toBe('queued');
    expect(desktopActivityState(dot('writer','paused'),run('running'),[],settings,1,false,false).activity).toBe('paused');
    for(const status of ['failed','interrupted'] as const) expect(desktopActivityState(dot('writer','idle'),run(status),[],settings,1,false,false).activity).toBe('error');
    const cancelled=desktopActivityState(dot('writer','idle'),run('cancelled'),[],settings,1,false,false);
    expect(cancelled.caption).toBe("I've stopped this task.");expect(cancelled.canStop).toBe(false);
    expect(desktopActivityState(undefined,undefined,[],settings,0,false,false).dot).toBeNull();
    const state=desktopActivityState(dot('writer','running'),{...run('running'),title:'x'.repeat(500)},[],{...settings,desktopDotVoice:true},2,true,true);
    expect(state.taskTitle).toHaveLength(100);expect(state.theme).toBe('dark');expect(state.voice).toBe(true);expect(state.pinned).toBe(true);
  });
});
describe('desktop position and preference persistence',()=>{
  it('keeps the dot visible across negative-coordinate displays and tiny work areas',()=>{
    expect(clampDesktopBounds({x:2000,y:-500,width:360,height:192},{x:-1920,y:0,width:1920,height:1040})).toEqual({x:-360,y:0,width:360,height:192});
    expect(clampDesktopBounds({x:-2000,y:900,width:360,height:192},{x:0,y:0,width:320,height:160})).toEqual({x:0,y:0,width:320,height:160});
  });
  it('migrates old settings and persists a sanitized position and opt-in voice',async()=>{
    const folder=await mkdtemp(join(tmpdir(),'dots-settings-'));
    try {
      const file=join(folder,'settings.json');await writeFile(file,JSON.stringify({theme:'dark',runInBackground:true}));
      const store=new SettingsStore(file,settings);await store.init();
      expect(store.get().desktopDotEnabled).toBe(true);expect(store.get().desktopDotVoice).toBe(false);expect(store.get().desktopDotPosition).toBeNull();
      await store.update({desktopDotPosition:{x:-1200.6,y:50.4},desktopDotVoice:true,desktopDotMode:'always'});
      const reloaded=new SettingsStore(file,settings);await reloaded.init();
      expect(reloaded.get().desktopDotPosition).toEqual({x:-1201,y:50});expect(reloaded.get().desktopDotVoice).toBe(true);expect(reloaded.get().desktopDotMode).toBe('always');
      await reloaded.update({desktopDotPosition:{x:NaN,y:0}});expect(reloaded.get().desktopDotPosition).toBeNull();
    } finally {await rm(folder,{recursive:true,force:true});}
  });
});
