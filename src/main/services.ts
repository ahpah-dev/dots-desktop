import { promises as fs } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import {
  CODEX_PROVIDER_ID,
  DEFAULT_BUDGET,
  type AppSettings,
  type ApprovalRequest,
  type Bootstrap,
  type CodexAuthStatus,
  type Dot,
  type DotInput,
  type DotPatch,
  type DotSummary,
  type LoginProgress,
  type ModelInfo,
  type ProviderOption,
  type ProviderProfile,
  type ProviderProfileInput,
  type PushEvent,
  type Run,
  type RunEvent
} from '@shared/types';
import type { DotsApi, RunOptions } from '@shared/api';
import { CredentialStore, type SecretCipher } from './storage/credentialStore';
import { DotStore } from './storage/dotStore';
import { ProviderStore } from './storage/providerStore';
import { RunStore } from './storage/runStore';
import { SettingsStore, defaultSettings } from './storage/settingsStore';
import { CodexAuthService } from './providers/codex/auth';
import { ProviderRegistry } from './providers/registry';
import { ApprovalGate } from './engine/approvals';
import { RunManager } from './engine/runManager';
import { Scheduler } from './engine/scheduler';
import { Paths, slugify } from './util/paths';
import { exists } from './util/jsonStore';
import { createLogger } from './util/logger';
import { errorMessage } from './util/misc';

const log = createLogger('services');

/** Things only the Electron shell can do. Injected so the services stay framework-agnostic. */
export interface Host {
  version: string;
  platform: string;
  documentsDir: string;
  cipher: SecretCipher;
  push(event: PushEvent): void;
  openExternal(url: string): Promise<void>;
  openPath(path: string): Promise<string>;
  pickFolder(initial?: string): Promise<string | null>;
  applySettings(settings: AppSettings): void;
  notifyRun(run: Run, dot: Dot): void;
  notifyApproval(req: ApprovalRequest): void;
  quit(): void;
}

export class Services implements DotsApi {
  readonly paths: Paths;
  readonly settings: SettingsStore;
  readonly creds: CredentialStore;
  readonly providerStore: ProviderStore;
  readonly dots: DotStore;
  readonly runs: RunStore;
  readonly auth: CodexAuthService;
  readonly registry: ProviderRegistry;
  readonly approvals = new ApprovalGate();
  readonly manager: RunManager;
  readonly scheduler: Scheduler;

  constructor(dataDir: string, private host: Host) {
    this.paths = new Paths(dataDir);
    this.settings = new SettingsStore(this.paths.settings, defaultSettings(join(host.documentsDir, 'Dots')));
    this.creds = new CredentialStore(this.paths.credentials, host.cipher);
    this.providerStore = new ProviderStore(this.paths.providers, this.creds);
    this.dots = new DotStore(this.paths);
    this.runs = new RunStore(this.paths);
    this.auth = new CodexAuthService(() => this.settings.get().codexPathOverride, (url) => host.openExternal(url));
    this.registry = new ProviderRegistry(this.auth, this.providerStore);
    this.manager = new RunManager(this.dots, this.runs, this.registry, this.settings, this.approvals);
    this.scheduler = new Scheduler(this.dots, this.manager, (id) => this.pushDot(id));
  }

  async init(): Promise<void> {
    await this.settings.init();
    await this.providerStore.init();
    await this.dots.init();
    await this.runs.init(this.dots.list().map((d) => d.id));
    for (const d of this.dots.list()) await this.scheduler.refresh(d);
    this.wire();
    this.scheduler.start();
  }

  private wire(): void {
    this.runs.runChanged.on((run) => {
      this.host.push({ type: 'run', run });
      this.pushDot(run.dotId);
    });
    this.runs.eventAdded.on((event) => this.host.push({ type: 'run-event', event }));
    this.manager.activityChanged.on((id) => this.pushDot(id));
    this.manager.finished.on((run) => {
      const dot = this.dots.get(run.dotId);
      if (dot) this.host.notifyRun(run, dot);
    });
    this.approvals.requested.on((approval) => {
      this.host.push({ type: 'approval', approval });
      this.host.notifyApproval(approval);
      this.pushDot(approval.dotId);
    });
    this.approvals.resolved.on((id) => this.host.push({ type: 'approval-resolved', id }));
    this.auth.statusChanged.on((auth) => this.host.push({ type: 'auth', auth }));
    this.auth.loginChanged.on((progress) => this.host.push({ type: 'login', progress }));
    this.settings.changed.on((settings) => this.host.push({ type: 'settings', settings }));
  }

  async shutdown(): Promise<void> {
    this.scheduler.stop();
    await this.manager.shutdown();
    await this.auth.cancelLogin().catch(() => undefined);
  }

  // ───────────── summaries ─────────────

  summarize(dot: Dot): DotSummary {
    const activeId = this.manager.activeRunId(dot.id);
    const active = activeId ? this.runs.get(activeId) : undefined;
    const last = this.runs.listForDot(dot.id, 1)[0];
    let status: DotSummary['status'] = 'idle';
    if (dot.paused) status = 'paused';
    else if (active) status = this.approvals.hasPendingForDot(dot.id) ? 'awaiting-approval' : active.status === 'queued' ? 'queued' : 'running';
    return {
      ...dot,
      status,
      activeRunId: activeId,
      lastRun: last ? { id: last.id, status: last.status, endedAt: last.endedAt, title: last.title } : undefined
    };
  }

  private pushDot(id: string): void {
    const dot = this.dots.get(id);
    if (dot) this.host.push({ type: 'dot', dot: this.summarize(dot) });
  }

  // ───────────── bootstrap & settings ─────────────

  async getBootstrap(): Promise<Bootstrap> {
    return {
      version: this.host.version,
      platform: this.host.platform,
      settings: this.settings.get(),
      auth: await this.auth.status(),
      providers: await this.providerStore.list(),
      dots: this.dots.list().map((d) => this.summarize(d)),
      approvals: this.approvals.list()
    };
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const before = this.settings.get();
    const next = await this.settings.update(patch);
    if (before.codexPathOverride !== next.codexPathOverride) {
      this.auth.invalidate();
      void this.auth.status(true).then((s) => this.host.push({ type: 'auth', auth: s }));
    }
    this.host.applySettings(next);
    return next;
  }

  // ───────────── auth ─────────────

  refreshAuth(): Promise<CodexAuthStatus> {
    return this.auth.status(true);
  }
  startCodexLogin(method: 'browser' | 'device'): Promise<void> {
    return this.auth.startLogin(method);
  }
  cancelCodexLogin(): Promise<void> {
    return this.auth.cancelLogin();
  }
  loginCodexWithApiKey(apiKey: string): Promise<CodexAuthStatus> {
    return this.auth.loginWithApiKey(apiKey);
  }
  logoutCodex(): Promise<CodexAuthStatus> {
    return this.auth.logout();
  }
  async getLoginProgress(): Promise<LoginProgress> {
    return this.auth.loginProgress();
  }

  // ───────────── providers ─────────────

  listProviderOptions(): Promise<ProviderOption[]> {
    return this.registry.options();
  }

  async saveProviderProfile(input: ProviderProfileInput): Promise<ProviderProfile> {
    const saved = await this.providerStore.save(input);
    this.host.push({ type: 'providers', providers: await this.providerStore.list() });
    return saved;
  }

  async deleteProviderProfile(id: string): Promise<void> {
    const inUse = this.dots.list().filter((d) => d.providerId === id);
    if (inUse.length) throw new Error(`Still used by: ${inUse.map((d) => d.name).join(', ')}. Switch those Dots to another provider first.`);
    await this.providerStore.delete(id);
    this.host.push({ type: 'providers', providers: await this.providerStore.list() });
  }

  async testProvider(id: string): Promise<{ ok: boolean; message: string }> {
    try {
      return await this.registry.get(id).test();
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }

  async listModels(providerId: string): Promise<ModelInfo[]> {
    try {
      return await this.registry.get(providerId).listModels();
    } catch (err) {
      log.warn('listModels failed', errorMessage(err));
      return [];
    }
  }

  // ───────────── dots ─────────────

  async defaultWorkspaceFor(name: string): Promise<string> {
    const root = this.settings.get().defaultWorkspaceRoot;
    const base = slugify(name);
    let candidate = join(root, base);
    for (let i = 2; await this.nonEmptyDir(candidate); i++) candidate = join(root, `${base}-${i}`);
    return candidate;
  }

  private async nonEmptyDir(p: string): Promise<boolean> {
    if (!(await exists(p))) return false;
    const taken = this.dots.list().some((d) => resolve(d.workspacePath) === resolve(p));
    if (taken) return true;
    return (await fs.readdir(p).catch(() => [])).length > 0;
  }

  async createDot(input: DotInput): Promise<DotSummary> {
    await this.assertProviderUsable(input.providerId);
    const workspace = input.workspacePath?.trim() ? this.validateWorkspace(input.workspacePath) : await this.defaultWorkspaceFor(input.name);
    const dot = await this.dots.create({ ...input, budget: input.budget ?? DEFAULT_BUDGET }, workspace);
    const refreshed = await this.scheduler.refresh(dot);
    const summary = this.summarize(refreshed);
    this.host.push({ type: 'dot', dot: summary });
    return summary;
  }

  async updateDot(id: string, patch: DotPatch): Promise<DotSummary> {
    if (patch.providerId) await this.assertProviderUsable(patch.providerId);
    if (patch.workspacePath !== undefined) {
      if (this.manager.isBusy(id)) throw new Error('Wait for the current task to finish before changing the workspace.');
      patch = { ...patch, workspacePath: this.validateWorkspace(patch.workspacePath) };
    }
    const dot = await this.dots.update(id, patch);
    const refreshed = await this.scheduler.refresh(dot);
    const summary = this.summarize(refreshed);
    this.host.push({ type: 'dot', dot: summary });
    return summary;
  }

  async deleteDot(id: string, deleteWorkspace: boolean): Promise<void> {
    const dot = this.dots.require(id);
    await this.manager.cancelForDot(id, 'user');
    for (let i = 0; i < 50 && this.manager.isBusy(id); i++) await new Promise((r) => setTimeout(r, 100));
    await this.dots.delete(id);
    // Only ever auto-delete workspaces that Dots created itself, never a folder the user pointed us at.
    const root = resolve(this.settings.get().defaultWorkspaceRoot);
    const ws = resolve(dot.workspacePath);
    if (deleteWorkspace && ws.startsWith(root + sep) && ws !== root) {
      await fs.rm(ws, { recursive: true, force: true }).catch((e) => log.warn('workspace delete failed', e));
    }
    this.host.push({ type: 'dot-removed', dotId: id });
  }

  async setDotPaused(id: string, paused: boolean): Promise<DotSummary> {
    const dot = this.dots.require(id);
    if (paused) await this.manager.cancelForDot(id, 'paused');
    const updated = (await this.dots.touch(id, { paused })) ?? dot;
    const refreshed = await this.scheduler.refresh(updated);
    const summary = this.summarize(refreshed);
    this.host.push({ type: 'dot', dot: summary });
    return summary;
  }

  async resetDotSession(id: string): Promise<DotSummary> {
    if (this.manager.isBusy(id)) throw new Error('Wait for the current task to finish first.');
    await this.dots.touch(id, { threadId: null });
    await this.dots.writeThread(id, { messages: [], updatedAt: Date.now() });
    const summary = this.summarize(this.dots.require(id));
    this.host.push({ type: 'dot', dot: summary });
    return summary;
  }

  private validateWorkspace(p: string): string {
    const abs = resolve(p.trim());
    if (!isAbsolute(abs)) throw new Error('Choose an absolute folder path for the workspace.');
    const root = resolve(this.paths.root);
    if (abs === root || abs.startsWith(root + sep)) throw new Error('The workspace can\'t be inside the app\'s own data folder.');
    if (abs === resolve('/') || /^[a-zA-Z]:\\?$/.test(abs)) throw new Error('Choose a specific folder, not a drive root.');
    return abs;
  }

  private async assertProviderUsable(providerId: string): Promise<void> {
    if (providerId === CODEX_PROVIDER_ID) return;
    if (!this.providerStore.get(providerId)) throw new Error('That model provider no longer exists.');
  }

  // ───────────── runs ─────────────

  async startRun(dotId: string, prompt: string, options?: RunOptions): Promise<Run> {
    const dot = this.dots.require(dotId);
    const run = await this.manager.start(dotId, prompt, { trigger: 'manual', newSession: options?.newSession });
    log.info(`Started run ${run.id} for "${dot.name}"`);
    return run;
  }

  cancelRun(runId: string): Promise<void> {
    return this.manager.cancel(runId, 'user');
  }

  async listRuns(dotId: string, limit = 50): Promise<Run[]> {
    return this.runs.listForDot(dotId, limit);
  }

  getRunEvents(runId: string): Promise<RunEvent[]> {
    return this.runs.events(runId);
  }

  async deleteRun(runId: string): Promise<void> {
    await this.runs.delete(runId);
  }

  async resolveApproval(id: string, approve: boolean): Promise<void> {
    this.approvals.resolve(id, approve);
  }

  async listApprovals(): Promise<ApprovalRequest[]> {
    return this.approvals.list();
  }

  // ───────────── memory ─────────────

  getMemory(dotId: string): Promise<string> {
    return this.dots.readMemory(dotId);
  }
  saveMemory(dotId: string, text: string): Promise<void> {
    return this.dots.writeMemory(dotId, text);
  }

  // ───────────── system ─────────────

  pickFolder(initial?: string): Promise<string | null> {
    return this.host.pickFolder(initial);
  }

  /** Only paths that belong to a Dot workspace or the app's own data may be opened from the UI. */
  private isKnownPath(p: string): boolean {
    const abs = resolve(p);
    const roots = [resolve(this.paths.root), resolve(this.settings.get().defaultWorkspaceRoot), ...this.dots.list().map((d) => resolve(d.workspacePath))];
    return roots.some((r) => abs === r || abs.startsWith(r + sep));
  }

  async openPath(path: string): Promise<void> {
    if (!this.isKnownPath(path)) throw new Error('That location is outside the folders Dots manages.');
    await fs.mkdir(path, { recursive: true }).catch(() => undefined);
    const err = await this.host.openPath(path);
    if (err) throw new Error(err);
  }

  async openExternal(url: string): Promise<void> {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only web links can be opened.');
    await this.host.openExternal(url);
  }

  async listWorkspaceFiles(dotId: string): Promise<{ path: string; size: number; isDir: boolean; mtime: number }[]> {
    const dot = this.dots.require(dotId);
    const out: { path: string; size: number; isDir: boolean; mtime: number }[] = [];
    const skip = new Set(['node_modules', '.git', '__pycache__', '.venv']);
    const walk = async (dir: string, depth: number) => {
      if (out.length >= 400 || depth > 3) return;
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (out.length >= 400) return;
        if (e.isDirectory() && skip.has(e.name)) continue;
        const full = join(dir, e.name);
        const st = await fs.stat(full).catch(() => null);
        if (!st) continue;
        out.push({ path: full.slice(dot.workspacePath.length + 1) || basename(full), size: st.size, isDir: e.isDirectory(), mtime: st.mtimeMs });
        if (e.isDirectory()) await walk(full, depth + 1);
      }
    };
    await walk(dot.workspacePath, 0);
    return out.sort((a, b) => b.mtime - a.mtime);
  }

  async quitApp(): Promise<void> {
    this.host.quit();
  }
}
