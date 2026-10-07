import { contextBridge, ipcRenderer } from 'electron';
import { DESKTOP_DOT_CONTROL_CHANNEL, DESKTOP_DOT_GET_CHANNEL, DESKTOP_DOT_STATE_CHANNEL, type DesktopDotBridge, type DesktopDotState } from '@shared/activity';
const bridge: DesktopDotBridge = {
  getState: () => ipcRenderer.invoke(DESKTOP_DOT_GET_CHANNEL),
  control: (action,runId) => ipcRenderer.invoke(DESKTOP_DOT_CONTROL_CHANNEL,action,runId),
  onState(listener) {
    const handler=(_event: Electron.IpcRendererEvent,state: DesktopDotState)=>listener(state);
    ipcRenderer.on(DESKTOP_DOT_STATE_CHANNEL,handler);
    return ()=>ipcRenderer.removeListener(DESKTOP_DOT_STATE_CHANNEL,handler);
  }
};
contextBridge.exposeInMainWorld('desktopDot',bridge);
