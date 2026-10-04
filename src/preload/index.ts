import { contextBridge, ipcRenderer } from 'electron';
import {
  API_CHANNEL_PREFIX, API_METHODS, PUSH_CHANNEL, WINDOW_STATE_CHANNEL,
  WINDOW_CONTROL_CHANNEL, WINDOW_GET_STATE_CHANNEL, type DotsApi, type DotsBridge, type WindowState
} from '@shared/api';
import type { PushEvent } from '@shared/types';

/** Electron prefixes remote errors with "Error invoking remote method…"; show only the useful part. */
function cleanError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const m = /Error invoking remote method '[^']+': (?:Error: )?([\s\S]*)$/.exec(raw);
  return new Error(m ? m[1] : raw);
}

const api = {} as Record<string, (...args: unknown[]) => Promise<unknown>>;
for (const name of API_METHODS) {
  api[name] = async (...args: unknown[]) => {
    try {
      return await ipcRenderer.invoke(`${API_CHANNEL_PREFIX}${name}`, ...args);
    } catch (err) {
      throw cleanError(err);
    }
  };
}

const bridge: DotsBridge = {
  api: api as unknown as DotsApi,
  window: {
    customTitleBar: process.platform === 'win32',
    getState: () => ipcRenderer.invoke(WINDOW_GET_STATE_CHANNEL),
    control: (action) => ipcRenderer.invoke(WINDOW_CONTROL_CHANNEL, action),
    onStateChanged(listener) {
      const handler = (_e: Electron.IpcRendererEvent, state: WindowState) => listener(state);
      ipcRenderer.on(WINDOW_STATE_CHANNEL, handler);
      return () => ipcRenderer.removeListener(WINDOW_STATE_CHANNEL, handler);
    }
  },
  onEvent(listener) {
    const handler = (_e: Electron.IpcRendererEvent, event: PushEvent) => listener(event);
    ipcRenderer.on(PUSH_CHANNEL, handler);
    return () => ipcRenderer.removeListener(PUSH_CHANNEL, handler);
  }
};

contextBridge.exposeInMainWorld('dots', bridge);
