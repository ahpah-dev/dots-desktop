import type {
  AppSettings,
  ApprovalRequest,
  Bootstrap,
  CodexAuthStatus,
  DotInput,
  DotPatch,
  DotSummary,
  DotTask,
  DotTaskInput,
  DotTaskPatch,
  Followup,
  FollowupInput,
  LoginProgress,
  ModelInfo,
  MemoryNote,
  MemoryNoteInput,
  ProviderOption,
  ProviderProfile,
  ProviderProfileInput,
  PushEvent,
  Run,
  RunEvent,
  TeamJob,
  TeamJobInput,
} from "./types";

export interface RunOptions {
  project?: Run['project'];
  /** Start a fresh conversation instead of continuing the previous one. */
  newSession?: boolean;
  /** Continue the selected conversation. Overrides the Dot's latest conversation. */
  conversationId?: string;
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
  startCodexLogin(method: "browser" | "device"): Promise<void>;
  cancelCodexLogin(): Promise<void>;
  loginCodexWithApiKey(apiKey: string): Promise<CodexAuthStatus>;
  logoutCodex(): Promise<CodexAuthStatus>;
  getLoginProgress(): Promise<LoginProgress>;

  // providers
  listProviderOptions(): Promise<ProviderOption[]>;
  saveProviderProfile(input: ProviderProfileInput): Promise<ProviderProfile>;
  deleteProviderProfile(id: string): Promise<void>;
  testProvider(id: string): Promise<{ ok: boolean; message: string }>;
  inspectProviderProfile(input: ProviderProfileInput): Promise<{ ok: boolean; message: string; models: ModelInfo[] }>;
  listModels(providerId: string): Promise<ModelInfo[]>;

  listTeamJobs(): Promise<TeamJob[]>;
  startTeamJob(input: TeamJobInput): Promise<TeamJob>;
  cancelTeamJob(id: string): Promise<TeamJob>;
  resumeTeamJob(id: string, additionalTokens?: number): Promise<TeamJob>;

  // dots
  createDot(input: DotInput): Promise<DotSummary>;
  updateDot(id: string, patch: DotPatch): Promise<DotSummary>;
  deleteDot(id: string, deleteWorkspace: boolean): Promise<void>;
  setDotPaused(id: string, paused: boolean): Promise<DotSummary>;
  resetDotSession(id: string): Promise<DotSummary>;
  defaultWorkspaceFor(name: string): Promise<string>;

  // runs
  startRun(dotId: string, prompt: string, options?: RunOptions): Promise<Run>;
  continueRun(runId: string, prompt: string, options?: Pick<RunOptions, 'project'>): Promise<Run>;
  reviseMessage(runId: string, prompt?: string): Promise<Run>;
  cancelRun(runId: string): Promise<void>;
  listRuns(dotId: string, limit?: number): Promise<Run[]>;
  listActivity(limit?: number): Promise<Run[]>;
  getRunEvents(runId: string): Promise<RunEvent[]>;
  deleteRun(runId: string): Promise<void>;
  resolveApproval(id: string, approve: boolean): Promise<void>;
  listApprovals(): Promise<ApprovalRequest[]>;

  // responsibilities and durable wakeups
  listTasks(dotId: string): Promise<DotTask[]>;
  createTask(dotId: string, input: DotTaskInput): Promise<DotTask>;
  updateTask(id: string, patch: DotTaskPatch): Promise<DotTask>;
  deleteTask(id: string): Promise<void>;
  runTask(id: string): Promise<Run>;
  listFollowups(dotId: string): Promise<Followup[]>;
  createFollowup(dotId: string, input: FollowupInput): Promise<Followup>;
  cancelFollowup(id: string): Promise<void>;

  // memory
  getMemory(dotId: string): Promise<string>;
  saveMemory(dotId: string, text: string): Promise<void>;
  listMemoryNotes(dotId: string): Promise<MemoryNote[]>;
  saveMemoryNote(dotId: string, input: MemoryNoteInput): Promise<MemoryNote>;
  deleteMemoryNote(dotId: string, id: string): Promise<void>;

  // system
  pickFolder(initial?: string): Promise<string | null>;
  openPath(path: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  listWorkspaceFiles(
    dotId: string,
  ): Promise<{ path: string; size: number; isDir: boolean; mtime: number }[]>;
  readWorkspaceFile(dotId: string, path: string): Promise<{ path: string; content: string; size: number }>;
  startWorkspacePreview(dotId: string, path: string): Promise<{ url: string }>;
  quitApp(): Promise<void>;
}

export type DotsApiMethod = keyof DotsApi;

export interface WindowState {
  maximized: boolean;
  focused: boolean;
  fullscreen: boolean;
}

export type WindowAction = "minimize" | "toggle-maximize" | "close";

/** What the preload script exposes on `window.dots`. */
export interface DotsBridge {
  api: DotsApi;
  onEvent(listener: (event: PushEvent) => void): () => void;
  window: {
    customTitleBar: boolean;
    getState(): Promise<WindowState>;
    control(action: WindowAction): Promise<void>;
    onStateChanged(listener: (state: WindowState) => void): () => void;
  };
}

export const API_CHANNEL_PREFIX = "api:";
export const PUSH_CHANNEL = "push";
export const WINDOW_STATE_CHANNEL = "window:state";
export const WINDOW_CONTROL_CHANNEL = "window:control";
export const WINDOW_GET_STATE_CHANNEL = "window:get-state";

/** Names of every API method, used to build the bridge without reflection on an interface. */
export const API_METHODS: DotsApiMethod[] = [
  "getBootstrap",
  "updateSettings",
  "refreshAuth",
  "startCodexLogin",
  "cancelCodexLogin",
  "loginCodexWithApiKey",
  "logoutCodex",
  "getLoginProgress",
  "listProviderOptions",
  "saveProviderProfile",
  "deleteProviderProfile",
  "testProvider",
  "inspectProviderProfile",
  "listModels",
  "listTeamJobs",
  "startTeamJob",
  "cancelTeamJob",
  "resumeTeamJob",
  "createDot",
  "updateDot",
  "deleteDot",
  "setDotPaused",
  "resetDotSession",
  "defaultWorkspaceFor",
  "startRun",
  "continueRun",
  "reviseMessage",
  "cancelRun",
  "listRuns",
  "listActivity",
  "getRunEvents",
  "deleteRun",
  "resolveApproval",
  "listApprovals",
  "listTasks",
  "createTask",
  "updateTask",
  "deleteTask",
  "runTask",
  "listFollowups",
  "createFollowup",
  "cancelFollowup",
  "getMemory",
  "saveMemory",
  "listMemoryNotes",
  "saveMemoryNote",
  "deleteMemoryNote",
  "pickFolder",
  "openPath",
  "openExternal",
  "listWorkspaceFiles",
  "readWorkspaceFile",
  "startWorkspacePreview",
  "quitApp",
];
