import { BrowserWindow, ipcMain, nativeTheme, screen, type IpcMainInvokeEvent } from 'electron';
import { join } from 'node:path';
import { DESKTOP_DOT_CONTROL_CHANNEL, DESKTOP_DOT_GET_CHANNEL, DESKTOP_DOT_STATE_CHANNEL, type DesktopDotAction, type DesktopDotState, type ToolEvent } from '@shared/activity';
import type { PushEvent, RunEvent } from '@shared/types';
import type { Services } from './services';
import { chooseDesktopDot, clampDesktopBounds, desktopActivityState } from './desktopActivity';
import { createLogger } from './util/logger';

const log = createLogger('desktop-dot');
const actions: DesktopDotAction[] = ['open','stop','hide','next','auto','toggle-voice','focus'];
// The companion needs status only, never the tool's arguments or output.
const activityEvent = ({ type,id,category,name,status,runId,dotId,seq,ts }: ToolEvent): ToolEvent => ({ type,id,category,name,status,runId,dotId,seq,ts });

export class DesktopDot {
  private window: BrowserWindow | null = null;
  private events = new Map<string, RunEvent[]>();
  private pinnedId?: string;
  private timer?: NodeJS.Timeout;
  private moveTimer?: NodeJS.Timeout;
  private disposed = false;
  private loaded = false;
  private lastSentVisible?: boolean;
  constructor(private services: Services, private mainVisible: () => boolean, private openMain: (nav: PushEvent) => void, private devUrl?: string) {
    const trusted = (e: IpcMainInvokeEvent) => !!this.window && e.sender === this.window.webContents && e.senderFrame === this.window.webContents.mainFrame;
    ipcMain.handle(DESKTOP_DOT_GET_CHANNEL, e => { if (!trusted(e)) throw new Error('Untrusted desktop dot sender'); return this.state(); });
    ipcMain.handle(DESKTOP_DOT_CONTROL_CHANNEL, async (e, action: unknown, runId: unknown) => {
      if (!trusted(e)) throw new Error('Untrusted desktop dot sender');
      if (!actions.includes(action as DesktopDotAction)) throw new Error('Invalid desktop dot action');
      await this.control(action as DesktopDotAction,typeof runId==='string'?runId:undefined);
    });
    screen.on('display-removed', this.reposition);
    screen.on('display-metrics-changed', this.reposition);
    nativeTheme.on('updated', this.sync);
    for (const dot of services.dots.list()) {
      const id = services.manager.activeRunId(dot.id);
      if (id) void services.runs.events(id).then(events => { if (!this.events.has(id)) this.events.set(id,events.filter((event): event is ToolEvent=>event.type==='tool').slice(-100).map(activityEvent)); this.sync(); }).catch(error=>log.warn('activity restore failed',error));
    }
  }
  onEvent(event: PushEvent): void {
    if (event.type === 'run-event' && event.event.type === 'tool') {
      const current=activityEvent(event.event);
      const events = this.events.get(current.runId) ?? [];
      this.events.set(current.runId, [...events.filter(item => item.type !== 'tool' || item.id !== current.id),current].slice(-100));
      if (this.events.size > 200) this.events.delete(this.events.keys().next().value!);
    }
    if (['dot','dot-removed','run','approval','approval-resolved','settings'].includes(event.type) || event.type === 'run-event' && event.event.type === 'tool') this.sync();
  }
  state(): DesktopDotState {
    const dots = this.services.dots.list().map(dot => this.services.summarize(dot));
    if (this.pinnedId && !dots.some(dot=>dot.id===this.pinnedId)) this.pinnedId=undefined;
    const dot = chooseDesktopDot(dots,this.pinnedId);
    const runId = dot ? this.services.manager.activeRunId(dot.id) : undefined;
    const run = runId ? this.services.runs.get(runId) : dot ? this.services.runs.listForDot(dot.id,1)[0] : undefined;
    return { ...desktopActivityState(dot,run,run ? this.events.get(run.id) ?? [] : [],this.services.settings.get(),dots.length,!!this.pinnedId,nativeTheme.shouldUseDarkColors), visible: this.window?.isVisible() ?? false };
  }
  sync = (): void => {
    if (this.disposed || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.disposed) return;
      const settings = this.services.settings.get();
      const visible = settings.desktopDotEnabled && !!this.services.dots.list().length && (settings.desktopDotMode === 'always' || !this.mainVisible());
      if (visible && !this.window) this.create();
      if (!this.window || this.window.isDestroyed()) return;
      if (visible && this.loaded && !this.window.isVisible()) { this.window.setFocusable(false); this.window.showInactive(); }
      else if (!visible) this.window.hide();
      if (this.loaded && (visible || this.lastSentVisible !== visible)) {
        this.window.webContents.send(DESKTOP_DOT_STATE_CHANNEL,this.state());
        this.lastSentVisible=visible;
      }
    },80);
  };
  private create(): void {
    const area = screen.getPrimaryDisplay().workArea;
    const position = this.services.settings.get().desktopDotPosition;
    const initial = { x: position?.x ?? area.x + area.width - 382, y: position?.y ?? area.y + area.height - 214, width: 360, height: 192 };
    const bounds = clampDesktopBounds(initial,screen.getDisplayMatching(initial).workArea);
    this.window = new BrowserWindow({ ...bounds, title:'Your desktop dot', show:false, frame:false, transparent:true, resizable:false, maximizable:false, minimizable:false, fullscreenable:false, alwaysOnTop:true, skipTaskbar:true, hasShadow:false, focusable:false,
      webPreferences:{preload:join(__dirname,'..','preload','desktopDot.js'),contextIsolation:true,sandbox:true,nodeIntegration:false,spellcheck:false,autoplayPolicy:'no-user-gesture-required'} });
    this.window.setAlwaysOnTop(true,'floating');
    this.window.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:false});
    this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    this.window.webContents.on('will-navigate',event=>event.preventDefault());
    this.window.webContents.on('did-finish-load',()=>{this.loaded=true;this.sync();});
    this.window.on('move',()=> {
      clearTimeout(this.moveTimer);
      this.moveTimer=setTimeout(()=> {
        if (!this.window || this.window.isDestroyed() || this.disposed) return;
        this.reposition();
        const {x,y}=this.window.getBounds();
        void this.services.updateSettings({desktopDotPosition:{x,y}}).catch(error=>log.warn('position save failed',error));
      },400);
    });
    this.window.on('closed',()=>{this.window=null;this.loaded=false;this.lastSentVisible=undefined;});
    this.window.on('close',event=>{if(!this.disposed){event.preventDefault();void this.services.updateSettings({desktopDotEnabled:false}).catch(error=>log.warn('hide failed',error));}});
    this.window.webContents.on('render-process-gone',()=>{if(!this.disposed&&this.window){this.loaded=false;this.window.reload();}});
    if (this.devUrl) void this.window.loadURL(new URL('widget.html',this.devUrl).href);
    else void this.window.loadFile(join(__dirname,'..','renderer','widget.html'));
  }
  private reposition = (): void => {
    if (!this.window || this.window.isDestroyed()) return;
    const current=this.window.getBounds();
    const next=clampDesktopBounds(current,screen.getDisplayMatching(current).workArea);
    if (JSON.stringify(current)!==JSON.stringify(next)) this.window.setBounds(next);
  };
  private async control(action: DesktopDotAction, runId?: string): Promise<void> {
    const state=this.state();
    switch(action) {
      case 'focus': this.window?.setFocusable(true); this.window?.focus(); break;
      case 'open': this.openMain({type:'navigate',dotId:state.dot?.id,runId:state.runId}); break;
      case 'stop': if (state.canStop && state.runId && state.runId===runId) await this.services.cancelRun(state.runId); break;
      case 'hide': await this.services.updateSettings({desktopDotEnabled:false}); break;
      case 'toggle-voice': await this.services.updateSettings({desktopDotVoice:!state.voice}); break;
      case 'auto': this.pinnedId=undefined; break;
      case 'next': {
        const dots=this.services.dots.list();
        const index=dots.findIndex(dot=>dot.id===state.dot?.id);
        this.pinnedId=dots[(index+1)%dots.length]?.id; break;
      }
    }
    this.sync();
  }
  dispose(): void {
    this.disposed=true;
    clearTimeout(this.timer);clearTimeout(this.moveTimer);
    screen.removeListener('display-removed',this.reposition);
    screen.removeListener('display-metrics-changed',this.reposition);
    nativeTheme.removeListener('updated',this.sync);
    ipcMain.removeHandler(DESKTOP_DOT_GET_CHANNEL);ipcMain.removeHandler(DESKTOP_DOT_CONTROL_CHANNEL);
    this.window?.destroy();this.window=null;
  }
}
