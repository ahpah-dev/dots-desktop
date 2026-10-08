/**
 * Shared domain model. Imported by main, preload and renderer.
 * Keep this file free of runtime dependencies.
 */

// ───────────────────────────── Providers ─────────────────────────────

/** Built-in provider id for the OpenAI Codex CLI. */
export const CODEX_PROVIDER_ID = "codex";

export type ProviderKind = "codex" | "openai-compatible";

/** A user-configured OpenAI-compatible endpoint. The API key itself is never stored here. */
export interface ProviderProfile {
  id: string;
  kind: "openai-compatible";
  label: string;
  baseUrl: string; // e.g. https://api.openai.com/v1
  defaultModel: string;
  hasKey: boolean;
}

export interface ProviderProfileInput {
  id?: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
  /** Only sent when the user types a new key. Empty/undefined keeps the existing one. */
  apiKey?: string;
}

export interface ProviderOption {
  id: string; // 'codex' or profile id
  kind: ProviderKind;
  label: string;
  available: boolean;
  reason?: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

// ───────────────────────────── Authentication ─────────────────────────────

export type CodexAuthMode = "chatgpt" | "apikey" | "unknown";

export interface CodexAuthStatus {
  /** Whether a Codex executable could be located. */
  installed: boolean;
  codexPath?: string;
  codexVersion?: string;
  /** Whether Codex reports an authenticated account. */
  loggedIn: boolean;
  mode?: CodexAuthMode;
  email?: string;
  plan?: string;
  error?: string;
}

export interface LoginProgress {
  active: boolean;
  method?: "browser" | "device" | "api-key";
  /** URL the user should open (device-code or browser flow). */
  url?: string;
  /** One-time device code, when applicable. */
  code?: string;
  message?: string;
  error?: string;
  done?: boolean;
}

// ───────────────────────────── Dots ─────────────────────────────

export type FileAccess = "read" | "write";
export type ApprovalMode = "never" | "ask";

export interface PermissionRule {
  id: string;
  /** Tool name (for example run_command) or * for every tool. */
  action: string;
  effect: "allow" | "ask" | "deny";
  /** Optional case-insensitive text fragment matched against tool arguments. */
  pattern?: string;
}

export interface DotAvatarConfig {
  shape: "circle" | "squircle" | "blob";
  eyes: "dot" | "happy" | "sleepy";
  glasses: "none" | "round" | "square";
  accessory: "none" | "cap" | "sprout" | "headphones";
}

export interface Permissions {
  /** Access to files inside the Dot's workspace. */
  files: FileAccess;
  /** May run shell commands. */
  shell: boolean;
  /** May browse / search the web and use the network. */
  web: boolean;
  /** Exchange messages with other Dots that have also enabled this option. */
  talkToDots?: boolean;
  /** Allow access outside the workspace (disables sandboxing — use with care). */
  outsideWorkspace: boolean;
  /** Ask before risky actions (shell, writes). Only enforceable for non-Codex providers. */
  approval: ApprovalMode;
  /** Ordered custom tool rules, enforced by OpenAI-compatible providers. Deny takes precedence. */
  rules?: PermissionRule[];
}

export type ScheduleSpec =
  | { kind: "interval"; everyMinutes: number }
  | { kind: "daily"; time: string; days: number[] } // time "HH:MM" local, days 0=Sun..6=Sat
  | { kind: "cron"; expr: string }; // 5-field cron, local time

export interface Schedule {
  enabled: boolean;
  spec: ScheduleSpec;
  /** What the Dot should do on each scheduled run. */
  prompt: string;
  /** Continue the existing conversation instead of starting fresh each time. */
  continueSession: boolean;
}

export interface Budget {
  /** Hard wall-clock limit per run. */
  maxMinutes: number;
  /** Max tool-calling iterations (OpenAI-compatible provider). */
  maxSteps: number;
}

export interface Dot {
  id: string;
  name: string;
  description: string;
  color: string; // hex
  emoji: string;
  avatar?: DotAvatarConfig;
  instructions: string;
  providerId: string;
  /** 'auto' lets the provider choose its recommended model. */
  model: string;
  reasoningEffort?: string;
  workspacePath: string;
  permissions: Permissions;
  budget: Budget;
  schedule: Schedule | null;
  paused: boolean;
  notify: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number | null;
  /** Provider conversation handle (Codex thread id) for session continuity. */
  threadId?: string | null;
  /** Start a fresh default conversation after a user reset or workspace change. */
  sessionResetAt?: number;
}

export type DotInput = Pick<
  Dot,
  | "name"
  | "description"
  | "color"
  | "emoji"
  | "instructions"
  | "providerId"
  | "model"
  | "permissions"
  | "notify"
> &
  Partial<
    Pick<
      Dot,
      "workspacePath" | "budget" | "schedule" | "reasoningEffort" | "avatar"
    >
  >;

export type DotPatch = Partial<Omit<Dot, "id" | "createdAt" | "updatedAt">>;

export type DotStatus =
  "idle" | "queued" | "running" | "awaiting-approval" | "paused";

export interface DotSummary extends Dot {
  status: DotStatus;
  activeRunId?: string;
  lastRun?: Pick<Run, "id" | "status" | "endedAt" | "title">;
}

// ───────────────────────────── Runs ─────────────────────────────

export type RunTrigger = "manual" | "schedule" | "followup" | "dot-message";
export type RunStatus =
  "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

export interface Run {
  id: string;
  dotId: string;
  trigger: RunTrigger;
  title: string;
  prompt: string;
  newSession: boolean;
  /** Independent provider conversation; follow-up runs retain this id. */
  conversationId?: string;
  parentRunId?: string;
  /** Earlier turns inherited by an edited or reverted conversation branch. */
  prefixRunIds?: string[];
  taskId?: string;
  followupId?: string;
  /** Provenance of a teammate request or automatic reply. */
  dotMessage?: {
    sourceDotId: string;
    sourceDotName: string;
    sourceRunId: string;
    rootRunId: string;
    depth: number;
    kind: "request" | "reply";
  };
  status: RunStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  finalMessage?: string;
  error?: string;
  usage?: Usage;
}

export type ToolStatus = "running" | "ok" | "error";

export type RunEventBody =
  | { type: "status"; status: RunStatus; note?: string }
  | { type: "user"; text: string }
  | { type: "message"; id: string; text: string }
  /** Live, in-progress assistant text. Streamed to the UI but never persisted. */
  | { type: "draft"; id: string; text: string }
  | { type: "reasoning"; id: string; text: string }
  | {
      type: "tool";
      id: string;
      /** Category used for icons: shell | file | web | search | memory | mcp | other */
      category: ToolCategory;
      name: string;
      input?: string;
      output?: string;
      status: ToolStatus;
    }
  | { type: "plan"; items: { text: string; done: boolean }[] }
  | { type: "file"; path: string; change: "add" | "update" | "delete" }
  | { type: "log"; level: "info" | "warn" | "error"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "final"; text: string };

export type ToolCategory =
  "shell" | "file" | "web" | "search" | "memory" | "mcp" | "other";

// Ongoing responsibilities, one-time wakeups, and editable durable knowledge.
export interface DotTask {
  id: string;
  dotId: string;
  title: string;
  prompt: string;
  status: "active" | "paused" | "completed";
  schedule: ScheduleSpec | null;
  continueSession: boolean;
  conversationId: string;
  nextRunAt: number | null;
  lastRunId?: string;
  lastRunAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type DotTaskInput = Pick<DotTask, "title" | "prompt"> &
  Partial<Pick<DotTask, "schedule" | "continueSession">>;
export type DotTaskPatch = Partial<
  Pick<DotTask, "title" | "prompt" | "status" | "schedule" | "continueSession">
>;

export interface Followup {
  id: string;
  dotId: string;
  prompt: string;
  dueAt: number;
  status: "pending" | "running" | "completed" | "cancelled" | "failed";
  conversationId?: string;
  taskId?: string;
  runId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface FollowupInput {
  prompt: string;
  dueAt: number;
  /** Continue a selected conversation rather than the Dot's latest conversation. */
  runId?: string;
  taskId?: string;
}

export interface MemoryNote {
  id: string;
  dotId: string;
  text: string;
  category: "preference" | "fact" | "decision" | "project";
  source: "manual" | "agent";
  createdAt: number;
  updatedAt: number;
}

export interface MemoryNoteInput {
  id?: string;
  text: string;
  category: MemoryNote["category"];
}

export type RunEvent = RunEventBody & {
  runId: string;
  dotId: string;
  seq: number;
  ts: number;
};

// ───────────────────────────── Approvals ─────────────────────────────

export interface ApprovalRequest {
  id: string;
  runId: string;
  dotId: string;
  dotName: string;
  kind: "shell" | "write" | "other";
  summary: string;
  detail?: string;
  createdAt: number;
}

// ───────────────────────────── Settings ─────────────────────────────

export interface AppSettings {
  /** Keep running in the system tray when the window is closed. */
  runInBackground: boolean;
  launchAtLogin: boolean;
  startMinimized: boolean;
  maxConcurrentRuns: number;
  desktopNotifications: boolean;
  desktopDotEnabled: boolean;
  desktopDotMode: "background" | "always";
  desktopDotVoice: boolean;
  desktopDotPosition: { x: number; y: number } | null;
  /** Load the user's own ~/.codex/config.toml (MCP servers, plugins, hooks…). Off = isolated, predictable runs. */
  useCodexUserConfig: boolean;
  /** Absolute path override for the Codex executable. */
  codexPathOverride: string;
  /** Where new Dot workspaces are created. */
  defaultWorkspaceRoot: string;
  theme: "system" | "light" | "dark";
  onboardingComplete: boolean;
}

export const DEFAULT_PERMISSIONS: Permissions = {
  files: "write",
  shell: true,
  web: true,
  talkToDots: false,
  outsideWorkspace: false,
  approval: "never",
};

export const DEFAULT_BUDGET: Budget = { maxMinutes: 30, maxSteps: 60 };

// ───────────────────────────── Bootstrap / events ─────────────────────────────

export interface Bootstrap {
  version: string;
  platform: NodeJS.Platform | string;
  settings: AppSettings;
  auth: CodexAuthStatus;
  providers: ProviderProfile[];
  dots: DotSummary[];
  approvals: ApprovalRequest[];
}

export type PushEvent =
  | { type: "dot"; dot: DotSummary }
  | { type: "dot-removed"; dotId: string }
  | { type: "run"; run: Run }
  | { type: "run-event"; event: RunEvent }
  | { type: "tasks"; dotId: string; tasks: DotTask[] }
  | { type: "followups"; dotId: string; followups: Followup[] }
  | { type: "memory"; dotId: string; notes: MemoryNote[] }
  | { type: "auth"; auth: CodexAuthStatus }
  | { type: "login"; progress: LoginProgress }
  | { type: "settings"; settings: AppSettings }
  | { type: "providers"; providers: ProviderProfile[] }
  | { type: "approval"; approval: ApprovalRequest }
  | { type: "approval-resolved"; id: string }
  | { type: "toast"; level: "info" | "success" | "error"; text: string }
  | { type: "navigate"; dotId?: string; runId?: string };
