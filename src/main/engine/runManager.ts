import type { Run, RunEventBody } from '@shared/types';
import type { DotStore } from '../storage/dotStore';
import type { RunStore } from '../storage/runStore';
import type { SettingsStore } from '../storage/settingsStore';
import type { ProviderRegistry } from '../providers/registry';
import { CancelledError, ProviderError, type RunContext } from '../providers/types';
import type { ApprovalGate } from './approvals';
import { buildContext, extractMemoryUpdates } from './context';
import { Emitter, errorMessage } from '../util/misc';
import { createLogger } from '../util/logger';

const log = createLogger('engine');

interface Active {
  controller: AbortController;
  reason?: 'user' | 'timeout' | 'shutdown' | 'paused';
}

export interface StartOptions {
  trigger: Run['trigger'];
  newSession?: boolean;
}

/**
 * Queues and executes Dot tasks with bounded concurrency. One Dot runs at most one task at a time;
 * every task has a wall-clock budget and can be cancelled at any moment.
 */
export class RunManager {
  private queue: string[] = [];
  private active = new Map<string, Active>(); // runId → state
  private shuttingDown = false;

  /** Fires after a run reaches a terminal state. */
  readonly finished = new Emitter<Run>();
  /** Fires whenever a Dot's activity state may have changed (start/finish/approval). */
  readonly activityChanged = new Emitter<string>();

  constructor(
    private dots: DotStore,
    private runs: RunStore,
    private providers: ProviderRegistry,
    private settings: SettingsStore,
    private approvals: ApprovalGate
  ) {}

  isBusy(dotId: string): boolean {
    return this.activeRunId(dotId) !== undefined;
  }

  /** Id of the queued or running task for a Dot, if any. */
  activeRunId(dotId: string): string | undefined {
    for (const id of [...this.queue, ...this.active.keys()]) {
      if (this.runs.get(id)?.dotId === dotId) return id;
    }
    return undefined;
  }

  async start(dotId: string, prompt: string, opts: StartOptions): Promise<Run> {
    if (this.shuttingDown) throw new Error('The app is shutting down.');
    const dot = this.dots.require(dotId);
    const text = prompt.trim();
    if (!text) throw new Error('Describe what the Dot should do.');
    if (dot.paused) throw new Error('This Dot is paused. Resume it first.');
    if (this.isBusy(dotId)) throw new Error('This Dot is already working on a task.');

    const run = await this.runs.create({ dotId, trigger: opts.trigger, prompt: text, newSession: !!opts.newSession });
    this.runs.addEvent(run, { type: 'user', text });
    this.runs.addEvent(run, { type: 'status', status: 'queued' });
    this.queue.push(run.id);
    this.activityChanged.emit(dotId);
    this.pump();
    return run;
  }

  private pump(): void {
    const max = this.settings.get().maxConcurrentRuns;
    while (!this.shuttingDown && this.active.size < max && this.queue.length) {
      const id = this.queue.shift()!;
      const run = this.runs.get(id);
      if (!run || run.status !== 'queued') continue;
      void this.execute(run).catch((err) => log.error('execute crashed', err));
    }
  }

  async cancel(runId: string, reason: Active['reason'] = 'user'): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    const qi = this.queue.indexOf(runId);
    if (qi >= 0) {
      this.queue.splice(qi, 1);
      await this.finalize(run, 'cancelled', { error: reason === 'paused' ? 'Paused before it started.' : 'Cancelled before it started.' });
      return;
    }
    const a = this.active.get(runId);
    if (a && !a.controller.signal.aborted) {
      a.reason = reason;
      a.controller.abort();
    }
  }

  async cancelForDot(dotId: string, reason: Active['reason']): Promise<void> {
    const id = this.activeRunId(dotId);
    if (id) await this.cancel(id, reason);
  }

  /** Stop everything (app quit). Running tasks are marked interrupted so they're visible next launch. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    for (const id of [...this.queue]) await this.cancel(id, 'shutdown');
    for (const [, a] of this.active) { a.reason = 'shutdown'; a.controller.abort(); }
    const deadline = Date.now() + 5000;
    while (this.active.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  }

  activeCount(): number {
    return this.active.size + this.queue.length;
  }

  private async execute(run: Run): Promise<void> {
    const dot = this.dots.get(run.dotId);
    const state: Active = { controller: new AbortController() };
    this.active.set(run.id, state);
    this.activityChanged.emit(run.dotId);

    if (!dot) {
      this.active.delete(run.id);
      await this.finalize(run, 'failed', { error: 'This Dot no longer exists.' });
      return;
    }

    const startedAt = Date.now();
    const current = await this.runs.update(run.id, { status: 'running', startedAt });
    this.runs.addEvent(current, { type: 'status', status: 'running' });

    const timeoutMs = dot.budget.maxMinutes * 60_000;
    const timer = setTimeout(() => { state.reason = 'timeout'; state.controller.abort(); }, timeoutMs);

    let threadId: string | null = dot.threadId ?? null;
    try {
      const provider = this.providers.get(dot.providerId);
      const memory = await this.dots.readMemory(dot.id);
      const recent = this.runs.listForDot(dot.id, 10).filter((r) => r.id !== run.id);
      const emit = (body: RunEventBody) => { this.runs.addEvent(current, body); };

      const ctx: RunContext = {
        run: current,
        dot,
        prompt: run.prompt,
        context: buildContext({ dot, memory, recentRuns: recent, trigger: run.trigger }),
        newSession: run.newSession,
        resumeThreadId: dot.threadId ?? null,
        signal: state.controller.signal,
        settings: this.settings.get(),
        emit,
        setThreadId: (id) => { threadId = id; },
        requestApproval: async (prompt) => {
          this.activityChanged.emit(dot.id);
          try {
            return await this.approvals.request({ runId: run.id, dotId: dot.id, dotName: dot.name }, prompt, state.controller.signal);
          } finally {
            this.activityChanged.emit(dot.id);
          }
        },
        remember: (note) => this.dots.appendMemory(dot.id, note),
        thread: {
          read: () => this.dots.readThread(dot.id),
          write: (messages) => this.dots.writeThread(dot.id, { messages, updatedAt: Date.now() })
        }
      };
      if (run.newSession) await this.dots.writeThread(dot.id, { messages: [], updatedAt: Date.now() });

      const result = await provider.run(ctx);
      if (state.controller.signal.aborted) throw new CancelledError();

      const { text, notes } = extractMemoryUpdates(result.finalMessage);
      for (const n of notes) await this.dots.appendMemory(dot.id, n).catch((e) => log.warn('memory append failed', e));
      if (notes.length) this.runs.addEvent(current, { type: 'log', level: 'info', text: `Saved ${notes.length} note${notes.length === 1 ? '' : 's'} to memory.` });

      const finalText = text || '(The agent finished without a written summary.)';
      this.runs.addEvent(current, { type: 'final', text: finalText });
      await this.finalize(current, 'succeeded', { finalMessage: finalText, usage: result.usage }, threadId);
    } catch (err) {
      const aborted = state.controller.signal.aborted || err instanceof CancelledError;
      if (aborted) {
        const why = state.reason;
        if (why === 'timeout') await this.finalize(current, 'failed', { error: `Stopped after reaching the ${dot.budget.maxMinutes}-minute time limit.` }, threadId);
        else if (why === 'shutdown') await this.finalize(current, 'interrupted', { error: 'The app was closed while this task was in progress.' }, threadId);
        else await this.finalize(current, 'cancelled', { error: why === 'paused' ? 'Stopped because the Dot was paused.' : 'Stopped by you.' }, threadId);
      } else {
        const message = err instanceof ProviderError ? err.message : errorMessage(err);
        log.error('run failed', run.id, err);
        await this.finalize(current, 'failed', { error: message }, threadId);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async finalize(run: Run, status: Run['status'], patch: Partial<Run>, threadId?: string | null): Promise<void> {
    const endedAt = Date.now();
    const done = await this.runs.update(run.id, { ...patch, status, endedAt });
    if (patch.error) this.runs.addEvent(done, { type: 'log', level: status === 'failed' ? 'error' : 'warn', text: patch.error });
    this.runs.addEvent(done, { type: 'status', status });
    const dotPatch: Record<string, unknown> = { lastRunAt: endedAt };
    if (threadId !== undefined) dotPatch.threadId = threadId;
    await this.dots.touch(run.dotId, dotPatch).catch((e) => log.warn('dot touch failed', e));
    this.active.delete(run.id);
    this.activityChanged.emit(run.dotId);
    this.finished.emit(done);
    this.pump();
  }
}
