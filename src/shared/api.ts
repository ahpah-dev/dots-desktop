import type {
  AppSettings,
  ApprovalRequest,
  Bootstrap,
  CodexAuthStatus,
  DotInput,
  DotPatch,
  DotSummary,
  LoginProgress,
  ModelInfo,
  ProviderOption,
  ProviderProfile,
  ProviderProfileInput,
  PushEvent,
  Run,
  RunEvent
} from './types';

export interface RunOptions {
  /** Start a fresh conversation instead of continuing the previous one. */
  newSession?: boolean;
}

/**
 * The full request/response surface between UI and main process.
 * Every method maps 1:1 to an `ipcMain.handle('api:<name>')` handler.
 */
export interface DotsApi {
  // bootstrap & settings
  getBootstrap(): Promise<Bootstrap>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;

  // auth
  refreshAuth(): Promise<CodexAuthStatus>;
  startCodexLogin(method: 'browser' | 'device'): Promise<void>;
  cancelCodexLogin(): Promise<void>;
  loginCodexWithApiKey(apiKey: string): Promise<CodexAuthStatus>;
  logoutCodex(): Promise<CodexAuthStatus>;
  getLoginProgress(): Promise<LoginProgress>;

  // providers
  listProviderOptions(): Promise<ProviderOption[]>;
  saveProviderProfile(input: ProviderProfileInput): Promise<ProviderProfile>;
  deleteProviderProfile(id: string): Promise<void>;
  testProvider(id: string): Promise<{ ok: boolean; message: string }>;
  listModels(providerId: string): Promise<ModelInfo[]>;

  // dots
  createDot(input: DotInput): Promise<DotSummary>;
  updateDot(id: string, patch: DotPatch): Promise<DotSummary>;
  deleteDot(id: string, deleteWorkspace: boolean): Promise<void>;
  setDotPaused(id: string, paused: boolean): Promise<DotSummary>;
  resetDotSession(id: string): Promise<DotSummary>;
  defaultWorkspaceFor(name: string): Promise<string>;

  // runs
  startRun(dotId: string, prompt: string, options?: RunOptions): Promise<Run>;
  cancelRun(runId: string): Promise<void>;
  listRuns(dotId: string, limit?: number): Promise<Run[]>;
  getRunEvents(runId: string): Promise<RunEvent[]>;
  deleteRun(runId: string): Promise<void>;
  resolveApproval(id: string, approve: boolean): Promise<void>;
  listApprovals(): Promise<ApprovalRequest[]>;

  // memory
  getMemory(dotId: string): Promise<string>;
  saveMemory(dotId: string, text: string): Promise<void>;

  // system
  pickFolder(initial?: string): Promise<string | null>;
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  listWorkspaceFiles(dotId: string): Promise<{ path: string; size: number; isDir: boolean; mtime: number }[]>;
  quitApp(): Promise<void>;
}

export type DotsApiMethod = keyof DotsApi;

/** What the preload script exposes on `window.dots`. */
export interface DotsBridge {
  api: DotsApi;
  onEvent(listener: (event: PushEvent) => void): () => void;
}

export const API_CHANNEL_PREFIX = 'api:';
export const PUSH_CHANNEL = 'push';

/** Names of every API method, used to build the bridge without reflection on an interface. */
export const API_METHODS: DotsApiMethod[] = [
  'getBootstrap',
  'updateSettings',
  'refreshAuth',
  'startCodexLogin',
  'cancelCodexLogin',
  'loginCodexWithApiKey',
  'logoutCodex',
  'getLoginProgress',
  'listProviderOptions',
  'saveProviderProfile',
  'deleteProviderProfile',
  'testProvider',
  'listModels',
  'createDot',
  'updateDot',
  'deleteDot',
  'setDotPaused',
  'resetDotSession',
  'defaultWorkspaceFor',
  'startRun',
  'cancelRun',
  'listRuns',
  'getRunEvents',
  'deleteRun',
  'resolveApproval',
  'listApprovals',
  'getMemory',
  'saveMemory',
  'pickFolder',
  'openPath',
  'openExternal',
  'listWorkspaceFiles',
  'quitApp'
];
