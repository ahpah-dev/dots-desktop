import type { CodexAuthStatus, LoginProgress, ModelInfo } from '@shared/types';
import { mergeModelsWithCatalog } from '@shared/models';
import { AppServerSession } from './appServer';
import { codexVersion, locateCodex } from './locator';
import { Emitter, errorMessage } from '../../util/misc';
import { createLogger } from '../../util/logger';

const log = createLogger('codex-auth');
const STATUS_TTL_MS = 20_000;
const MODELS_TTL_MS = 10 * 60_000;
const LOGIN_TIMEOUT_MS = 10 * 60_000;

/**
 * Detects and manages the user's Codex authentication using Codex's own official flows
 * (`account/read`, `account/login/start`, `account/logout` over the app-server protocol).
 * This app never reads, copies or stores Codex tokens: they stay in Codex's own credential store.
 */
export class CodexAuthService {
  readonly statusChanged = new Emitter<CodexAuthStatus>();
  readonly loginChanged = new Emitter<LoginProgress>();

  private cached: { at: number; status: CodexAuthStatus } | null = null;
  private inflight: Promise<CodexAuthStatus> | null = null;
  private modelCache: { at: number; models: ModelInfo[] } | null = null;
  private versionCache = new Map<string, string | undefined>();

  private loginSession: AppServerSession | null = null;
  private loginId: string | null = null;
  private loginTimer: NodeJS.Timeout | null = null;
  private progress: LoginProgress = { active: false };

  constructor(
    private getOverride: () => string,
    private openExternal: (url: string) => Promise<void>
  ) {}

  /** Resolved path of the Codex executable (or undefined if not installed). */
  path(): string | undefined {
    return locateCodex(this.getOverride());
  }

  invalidate(): void {
    this.cached = null;
    this.modelCache = null;
  }

  loginProgress(): LoginProgress {
    return this.progress;
  }

  async status(force = false): Promise<CodexAuthStatus> {
    if (!force && this.cached && Date.now() - this.cached.at < STATUS_TTL_MS) return this.cached.status;
    if (this.inflight) return this.inflight;
    this.inflight = this.readStatus().finally(() => { this.inflight = null; });
    const status = await this.inflight;
    this.cached = { at: Date.now(), status };
    return status;
  }

  private async readStatus(): Promise<CodexAuthStatus> {
    const exe = this.path();
    if (!exe) {
      return { installed: false, loggedIn: false, error: 'The Codex CLI was not found on this computer.' };
    }
    if (!this.versionCache.has(exe)) this.versionCache.set(exe, await codexVersion(exe));
    const base = { installed: true, codexPath: exe, codexVersion: this.versionCache.get(exe) };
    let session: AppServerSession | undefined;
    try {
      session = await AppServerSession.open(exe);
      const res = await session.request('account/read', { refreshToken: false }, 20_000);
      const account = res?.account;
      if (!account) return { ...base, loggedIn: false };
      if (account.type === 'chatgpt') {
        return { ...base, loggedIn: true, mode: 'chatgpt', email: account.email ?? undefined, plan: account.planType };
      }
      if (account.type === 'apiKey') return { ...base, loggedIn: true, mode: 'apikey' };
      return { ...base, loggedIn: true, mode: 'unknown' };
    } catch (err) {
      log.warn('account/read failed', errorMessage(err));
      return { ...base, loggedIn: false, error: `Couldn't check Codex sign-in: ${errorMessage(err)}` };
    } finally {
      session?.close();
    }
  }

  async models(): Promise<ModelInfo[]> {
    if (this.modelCache && Date.now() - this.modelCache.at < MODELS_TTL_MS) return this.modelCache.models;
    const exe = this.path();
    if (!exe) return mergeModelsWithCatalog([]);
    let session: AppServerSession | undefined;
    try {
      session = await AppServerSession.open(exe);
      const models: ModelInfo[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 5; page++) {
        const res: any = await session.request('model/list', { cursor, limit: 100, includeHidden: false }, 20_000);
        for (const m of res?.data ?? []) {
          models.push({
            id: m.model ?? m.id,
            label: m.displayName ?? m.model ?? m.id,
            description: m.description || undefined,
            isDefault: !!m.isDefault,
            reasoningEfforts: (m.supportedReasoningEfforts ?? []).map((e: any) => e.reasoningEffort),
            defaultReasoningEffort: m.defaultReasoningEffort
          });
        }
        cursor = res?.nextCursor ?? null;
        if (!cursor) break;
      }
      const merged = mergeModelsWithCatalog(models);
      this.modelCache = { at: Date.now(), models: merged };
      return merged;
    } catch (err) {
      log.warn('model/list failed', errorMessage(err));
      return this.modelCache?.models ?? mergeModelsWithCatalog([]);
    } finally {
      session?.close();
    }
  }

  // ───────────── login flows ─────────────

  private setProgress(p: LoginProgress): void {
    this.progress = p;
    this.loginChanged.emit(p);
  }

  /** Start an official ChatGPT sign-in (browser redirect or device code). */
  async startLogin(method: 'browser' | 'device'): Promise<void> {
    const exe = this.path();
    if (!exe) throw new Error('The Codex CLI was not found on this computer.');
    await this.cancelLogin();

    this.setProgress({ active: true, method, message: 'Starting sign-in…' });
    let session: AppServerSession;
    try {
      session = await AppServerSession.open(exe);
    } catch (err) {
      this.setProgress({ active: false, method, error: errorMessage(err) });
      throw err;
    }
    this.loginSession = session;

    session.onNotification((n) => {
      if (n.method === 'account/login/completed') {
        const { success, error } = n.params ?? {};
        void this.finishLogin(success ? undefined : (error ?? 'Sign-in was not completed.'));
      }
    });

    try {
      const res = await session.request(
        'account/login/start',
        method === 'browser' ? { type: 'chatgpt' } : { type: 'chatgptDeviceCode' },
        30_000
      );
      this.loginId = res?.loginId ?? null;
      if (res?.type === 'chatgpt' && res.authUrl) {
        this.setProgress({ active: true, method, url: res.authUrl, message: 'Finish signing in in your browser…' });
        await this.openExternal(res.authUrl).catch(() => undefined);
      } else if (res?.type === 'chatgptDeviceCode') {
        this.setProgress({
          active: true, method, url: res.verificationUrl, code: res.userCode,
          message: 'Open the link and enter the code to sign in.'
        });
        await this.openExternal(res.verificationUrl).catch(() => undefined);
      } else {
        throw new Error('Codex returned an unexpected login response.');
      }
      this.loginTimer = setTimeout(() => void this.finishLogin('Sign-in timed out. Please try again.'), LOGIN_TIMEOUT_MS);
    } catch (err) {
      await this.finishLogin(errorMessage(err));
      throw err;
    }
  }

  private async finishLogin(error?: string): Promise<void> {
    if (this.loginTimer) clearTimeout(this.loginTimer);
    this.loginTimer = null;
    const session = this.loginSession;
    this.loginSession = null;
    this.loginId = null;
    session?.close();
    const method = this.progress.method;
    this.invalidate();
    if (error) {
      this.setProgress({ active: false, method, error });
    } else {
      this.setProgress({ active: false, method, done: true, message: 'Signed in.' });
    }
    const status = await this.status(true);
    this.statusChanged.emit(status);
  }

  async cancelLogin(): Promise<void> {
    if (!this.loginSession) return;
    const session = this.loginSession;
    const id = this.loginId;
    if (id) await session.request('account/login/cancel', { loginId: id }, 5000).catch(() => undefined);
    if (this.loginTimer) clearTimeout(this.loginTimer);
    this.loginTimer = null;
    this.loginSession = null;
    this.loginId = null;
    session.close();
    this.setProgress({ active: false });
  }

  /** Sign in with an OpenAI API key through Codex's own login (Codex stores it in its credential store). */
  async loginWithApiKey(apiKey: string): Promise<CodexAuthStatus> {
    const exe = this.path();
    if (!exe) throw new Error('The Codex CLI was not found on this computer.');
    const key = apiKey.trim();
    if (!/^sk-[\w-]{10,}$/.test(key)) throw new Error('That doesn\'t look like an OpenAI API key (it should start with "sk-").');
    let session: AppServerSession | undefined;
    try {
      session = await AppServerSession.open(exe);
      await session.request('account/login/start', { type: 'apiKey', apiKey: key }, 20_000);
    } finally {
      session?.close();
    }
    this.invalidate();
    const status = await this.status(true);
    this.statusChanged.emit(status);
    return status;
  }

  async logout(): Promise<CodexAuthStatus> {
    const exe = this.path();
    if (exe) {
      let session: AppServerSession | undefined;
      try {
        session = await AppServerSession.open(exe);
        await session.request('account/logout', {}, 15_000);
      } finally {
        session?.close();
      }
    }
    this.invalidate();
    const status = await this.status(true);
    this.statusChanged.emit(status);
    return status;
  }
}
