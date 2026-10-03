import {
  BrowserWindow, Menu, Notification, Tray, app, dialog, ipcMain, nativeImage, nativeTheme,
  powerSaveBlocker, safeStorage, session, shell, type IpcMainInvokeEvent
} from 'electron';
import { join } from 'node:path';
import { API_CHANNEL_PREFIX, API_METHODS, PUSH_CHANNEL } from '@shared/api';
import type { AppSettings, ApprovalRequest, Dot, PushEvent, Run } from '@shared/types';
import { Services, type Host } from './services';
import { createLogger, initLogger } from './util/logger';
import { firstLine } from './util/misc';

const log = createLogger('main');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const startHidden = process.argv.includes('--hidden');

let services: Services | null = null;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let shutdownDone = false;
let blockerId: number | null = null;
let trayHintShown = false;

process.on('uncaughtException', (err) => log.error('uncaughtException', err));
process.on('unhandledRejection', (err) => log.error('unhandledRejection', err));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
  void bootstrap();
}

function asset(name: string): string {
  return join(app.getAppPath(), 'assets', name);
}

function push(event: PushEvent): void {
  if (win && !win.isDestroyed()) win.webContents.send(PUSH_CHANNEL, event);
}

function showWindow(nav?: PushEvent): void {
  if (!win || win.isDestroyed()) createWindow(false);
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  if (nav) win?.webContents.once('did-finish-load', () => push(nav));
  if (nav && win && !win.webContents.isLoading()) push(nav);
}

function createWindow(hidden: boolean): void {
  const dark = nativeTheme.shouldUseDarkColors;
  win = new BrowserWindow({
    width: 1240,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Dots',
    backgroundColor: dark ? '#0f1115' : '#f7f7f5',
    icon: process.platform === 'win32' ? asset('icon.ico') : asset('icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true
    }
  });

  win.once('ready-to-show', () => {
    if (!hidden) win?.show();
    if (process.argv.includes('--capture-screenshot')) {
      const idx = process.argv.indexOf('--capture-screenshot');
      const targetPath = process.argv[idx + 1] || 'screenshot.png';
      setTimeout(async () => {
        try {
          const img = await win?.webContents.capturePage();
          if (img) {
            const { writeFileSync } = await import('node:fs');
            writeFileSync(targetPath, img.toPNG());
            log.info('Screenshot captured to', targetPath);
          }
        } finally {
          quitting = true;
          app.quit();
        }
      }, 2500);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const internal = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
    if (!internal) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log.error('renderer gone', details);
    if (details.reason !== 'clean-exit' && win && !win.isDestroyed()) win.reload();
  });

  // Closing hides to the tray so agents keep working; quitting is explicit.
  win.on('close', (e) => {
    if (quitting) return;
    const s = services?.settings.get();
    if (s?.runInBackground) {
      e.preventDefault();
      win?.hide();
      if (!trayHintShown && Notification.isSupported()) {
        trayHintShown = true;
        new Notification({ title: 'Dots is still running', body: 'Your Dots keep working in the background. Use the tray icon to reopen or quit.', silent: true }).show();
      }
    } else if (services && services.manager.activeCount() > 0) {
      const choice = dialog.showMessageBoxSync(win!, {
        type: 'warning', buttons: ['Keep running in background', 'Quit and stop tasks'], defaultId: 0, cancelId: 0,
        title: 'Tasks are running', message: 'Some Dots are still working.',
        detail: 'Quitting will stop their current tasks. You can enable "Keep running in the background" in Settings.'
      });
      if (choice === 0) { e.preventDefault(); win?.hide(); }
    }
  });
  win.on('closed', () => { win = null; });

  if (DEV_URL) void win.loadURL(DEV_URL);
  else void win.loadFile(join(__dirname, '..', 'renderer', 'index.html'));
  if (DEV_URL) win.webContents.openDevTools({ mode: 'detach' });
}

// ───────────── IPC ─────────────

function isTrustedSender(e: IpcMainInvokeEvent): boolean {
  if (!win || e.sender !== win.webContents) return false;
  const url = e.senderFrame?.url ?? '';
  return DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
}

function registerIpc(svc: Services): void {
  for (const name of API_METHODS) {
    ipcMain.handle(`${API_CHANNEL_PREFIX}${name}`, async (e, ...args: unknown[]) => {
      if (!isTrustedSender(e)) throw new Error('Untrusted sender');
      const fn = (svc as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name];
      try {
        return await fn.apply(svc, args);
      } catch (err) {
        log.warn(`api:${name} failed:`, err instanceof Error ? err.message : err);
        throw err instanceof Error ? err : new Error(String(err));
      }
    });
  }
}

// ───────────── tray, notifications, power ─────────────

function buildTray(): void {
  const img = nativeImage.createFromPath(asset('tray.png'));
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
  tray.setToolTip('Dots');
  tray.on('click', () => showWindow());
  refreshTray();
}

let trayTimer: NodeJS.Timeout | null = null;
function refreshTray(): void {
  if (!tray || !services) return;
  if (trayTimer) return;
  trayTimer = setTimeout(() => {
    trayTimer = null;
    if (!tray || !services) return;
    const dots = services.dots.list().map((d) => services!.summarize(d));
    const running = dots.filter((d) => d.status === 'running' || d.status === 'queued' || d.status === 'awaiting-approval').length;
    const waiting = dots.filter((d) => d.status === 'awaiting-approval').length;
    tray.setToolTip(running ? `Dots — ${running} working` : 'Dots');
    const settings = services.settings.get();
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Open Dots', click: () => showWindow() },
      { type: 'separator' },
      { label: running ? `${running} Dot${running === 1 ? '' : 's'} working${waiting ? ` · ${waiting} need approval` : ''}` : 'All Dots idle', enabled: false },
      ...dots.slice(0, 8).map((d) => ({
        label: `${d.emoji} ${d.name} — ${d.status === 'awaiting-approval' ? 'needs approval' : d.status}`,
        click: () => showWindow({ type: 'navigate', dotId: d.id })
      })),
      { type: 'separator' },
      {
        label: 'Keep running in background', type: 'checkbox', checked: settings.runInBackground,
        click: (item) => void services?.updateSettings({ runInBackground: item.checked })
      },
      { label: 'Quit Dots', click: () => { quitting = true; app.quit(); } }
    ]));
  }, 250);
}

function updatePowerBlocker(): void {
  const busy = (services?.manager.activeCount() ?? 0) > 0;
  if (busy && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension');
  else if (!busy && blockerId !== null) { powerSaveBlocker.stop(blockerId); blockerId = null; }
}

function notifyRun(run: Run, dot: Dot): void {
  if (!dot.notify || !services?.settings.get().desktopNotifications) return;
  if (run.status === 'cancelled' || run.status === 'interrupted') return;
  if (!Notification.isSupported()) return;
  if (win?.isVisible() && win.isFocused()) return; // user is already looking at the app
  const ok = run.status === 'succeeded';
  const n = new Notification({
    title: `${dot.emoji} ${dot.name} ${ok ? 'finished' : 'hit a problem'}`,
    body: firstLine(ok ? (run.finalMessage ?? run.title) : (run.error ?? 'Task failed'), 140)
  });
  n.on('click', () => showWindow({ type: 'navigate', dotId: dot.id, runId: run.id }));
  n.show();
}

function notifyApproval(req: ApprovalRequest): void {
  if (!Notification.isSupported() || !services?.settings.get().desktopNotifications) return;
  if (win?.isVisible() && win.isFocused()) return;
  const n = new Notification({ title: `${req.dotName} needs your approval`, body: firstLine(req.detail ?? req.summary, 140) });
  n.on('click', () => showWindow({ type: 'navigate', dotId: req.dotId, runId: req.runId }));
  n.show();
}

function applySettings(s: AppSettings): void {
  nativeTheme.themeSource = s.theme;
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: s.launchAtLogin, args: s.launchAtLogin ? ['--hidden'] : [] });
  }
}

// ───────────── lifecycle ─────────────

async function bootstrap(): Promise<void> {
  await app.whenReady();
  if (process.platform === 'win32') {
    app.setAppUserModelId('app.dots.desktop');
  }
  initLogger(join(app.getPath('userData'), 'logs'));
  log.info(`Starting Dots ${app.getVersion()} on ${process.platform}`);

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  if (!DEV_URL) {
    session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
      cb({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"]
        }
      });
    });
  }

  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  else Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }
  ]));

  const host: Host = {
    version: app.getVersion(),
    platform: process.platform,
    documentsDir: app.getPath('documents'),
    cipher: {
      isAvailable: () => safeStorage.isEncryptionAvailable(),
      encrypt: (s) => safeStorage.encryptString(s),
      decrypt: (b) => safeStorage.decryptString(b)
    },
    push,
    openExternal: (url) => shell.openExternal(url),
    openPath: (p) => shell.openPath(p),
    pickFolder: async (initial) => {
      const r = await dialog.showOpenDialog(win!, { properties: ['openDirectory', 'createDirectory'], defaultPath: initial });
      return r.canceled ? null : (r.filePaths[0] ?? null);
    },
    applySettings,
    notifyRun,
    notifyApproval,
    quit: () => { quitting = true; app.quit(); }
  };

  services = new Services(app.getPath('userData'), host);
  await services.init();
  registerIpc(services);
  applySettings(services.settings.get());

  services.manager.activityChanged.on(() => { refreshTray(); updatePowerBlocker(); });
  services.approvals.requested.on(() => refreshTray());
  services.approvals.resolved.on(() => refreshTray());
  buildTray();

  const s = services.settings.get();
  createWindow(startHidden || (s.startMinimized && s.runInBackground));
  // Pre-warm Codex detection so the first screen is instant.
  void services.auth.status().then((auth) => push({ type: 'auth', auth }));

  app.on('activate', () => showWindow());
}

app.on('window-all-closed', () => {
  // Stay alive in the tray when background mode is on (the close handler hides instead of closing).
  if (!services?.settings.get().runInBackground || quitting) app.quit();
});

app.on('before-quit', (e) => {
  quitting = true;
  if (shutdownDone || !services) return;
  e.preventDefault();
  void services.shutdown().catch((err) => log.error('shutdown failed', err)).finally(() => {
    shutdownDone = true;
    tray?.destroy();
    app.quit();
  });
});
