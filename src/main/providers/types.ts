import type { AppSettings, Dot, ModelInfo, Run, RunEventBody, Usage } from '@shared/types';

/** An approval the agent needs before taking a risky action. Resolves true when approved. */
export interface ApprovalPrompt {
  kind: 'shell' | 'write' | 'other';
  summary: string;
  detail?: string;
}

export interface ThreadAccess {
  read(): Promise<{ messages: unknown[]; updatedAt: number }>;
  write(messages: unknown[]): Promise<void>;
}

/** Everything a provider needs to execute one task for a Dot. */
export interface RunContext {
  run: Run;
  dot: Dot;
  /** The task for this run. */
  prompt: string;
  /** Dot instructions + memory + environment, prepended as the agent's standing context. */
  context: string;
  newSession: boolean;
  /** Provider session handle from a previous run (Codex thread id). */
  resumeThreadId: string | null;
  /** Aborted on cancel or timeout. Providers must stop promptly and clean up child processes. */
  signal: AbortSignal;
  settings: AppSettings;
  emit(event: RunEventBody): void;
  /** Persist a provider session handle as soon as it is known. */
  setThreadId(id: string): void;
  requestApproval(prompt: ApprovalPrompt): Promise<boolean>;
  remember(note: string): Promise<void>;
  scheduleFollowup?(prompt: string, dueAt: number): Promise<string>;
  listTeammates?(): Promise<{ id: string; name: string; description: string; busy: boolean }[]>;
  sendDotMessage?(dotId: string, message: string): Promise<string>;
  thread: ThreadAccess;
}

export interface ProviderResult {
  finalMessage: string;
  usage?: Usage;
}

/**
 * Anything that can carry out a Dot's task. Implement this interface (and register it in
 * `ProviderRegistry`) to add new models, APIs or agent runtimes.
 */
export interface AgentProvider {
  readonly id: string;
  readonly label: string;
  run(ctx: RunContext): Promise<ProviderResult>;
  listModels(): Promise<ModelInfo[]>;
  test(): Promise<{ ok: boolean; message: string }>;
}

/** Thrown by providers for failures whose message is already user-friendly. */
export class ProviderError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class CancelledError extends Error {
  constructor(reason = 'Cancelled') {
    super(reason);
    this.name = 'CancelledError';
  }
}
