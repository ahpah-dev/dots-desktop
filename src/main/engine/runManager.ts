import type { Run, RunEventBody } from '@shared/types';
import type { DotStore } from '../storage/dotStore';
import type { RunStore } from '../storage/runStore';
import type { SettingsStore } from '../storage/settingsStore';
import type { WorkStore } from '../storage/workStore';
import type { ProviderRegistry } from '../providers/registry';
import { CancelledError, ProviderError, type RunContext } from '../providers/types';
import type { ApprovalGate } from './approvals';
import { buildContext, extractMemoryUpdates, extractFollowups } from './context';
import { Emitter, errorMessage } from '../util/misc';
import { createLogger } from '../util/logger';
import { matchingRule } from '../tools/permissions';

const log = createLogger('engine');

interface Active {
  controller: AbortController;
  reason?: 'user' | 'timeout' | 'shutdown' | 'paused';
}

export interface StartOptions {
  trigger: Run['trigger'];
  newSession?: boolean;
  conversationId?: string;
  parentRunId?: string;
  taskId?: string;
  followupId?: string;
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
    private approvals: ApprovalGate,
    private work?: WorkStore
  ) {}

  isBusy(dotId: string): boolean {
    return this.activeRunId(dotId) !== undefined;
  }

  /** Id of the queued or running task for a Dot, if any. */
  activeRunId(dotId: string): string | undefined {
    for (const id of [...this.active.keys(), ...this.queue]) {
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
    if (this.queue.filter((id) => this.runs.get(id)?.dotId === dotId).length >= 25) throw new Error('This Dot already has 25 tasks queued.');

    const previous = this.runs.listForDot(dotId, 1)[0];
    const latestConversation = !dot.sessionResetAt || (previous?.createdAt ?? 0) > dot.sessionResetAt ? previous?.conversationId : undefined;
    const conversationId = opts.newSession ? undefined : opts.conversationId ?? latestConversation ?? (dot.threadId ? `legacy-${dot.id}` : undefined);
    const run = await this.runs.create({ dotId, trigger: opts.trigger, prompt: text, newSession: !!opts.newSession,
      conversationId, parentRunId: opts.parentRunId, taskId: opts.taskId, followupId: opts.followupId });
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
      // Several conversations can queue for one Dot, but its workspace is only mutated by one run at a time.
      const index = this.queue.findIndex((id) => {
        const candidate = this.runs.get(id);
        return candidate && !this.dots.get(candidate.dotId)?.paused && ![...this.active.keys()].some((activeId) => this.runs.get(activeId)?.dotId === candidate.dotId);
      });
      if (index < 0) break;
      const [id] = this.queue.splice(index, 1);
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
      await this.finalize(run, reason === 'shutdown' ? 'interrupted' : 'cancelled', { error: reason === 'paused' ? 'Paused before it started.' : reason === 'shutdown' ? 'The app closed before this task started.' : 'Cancelled before it started.' });
      return;
    }
    const a = this.active.get(runId);
    if (a && !a.controller.signal.aborted) {
      a.reason = reason;
      a.controller.abort();
    }
  }

  async cancelForDot(dotId: string, reason: Active['reason']): Promise<void> {
    await this.cancelMatching((run) => run.dotId === dotId, reason);
  }

  async cancelForTask(taskId: string, reason: Active['reason'] = 'user'): Promise<void> {
    await this.cancelMatching((run) => run.taskId === taskId, reason);
  }

  private async cancelMatching(matches: (run: Run) => boolean, reason: Active['reason']): Promise<void> {
    // Remove every queued match before aborting the active run: finalization must not start the next cancelled task.
    const queued = this.queue.filter((id) => { const run = this.runs.get(id); return !!run && matches(run); });
    const removed = new Set(queued);
    this.queue = this.queue.filter((id) => !removed.has(id));
    for (const [id, state] of this.active) {
      const run = this.runs.get(id);
      if (run && matches(run)) { state.reason = reason; state.controller.abort(); }
    }
    for (const id of queued) {
      const run = this.runs.get(id);
      if (run) await this.finalize(run, reason === 'shutdown' ? 'interrupted' : 'cancelled', { error: reason === 'paused' ? 'Paused before it started.' : 'Cancelled before it started.' });
    }
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

    const conversationId = run.conversationId ?? `legacy-${dot.id}`;
    let threadId: string | null = null;
    try {
      const provider = this.providers.get(dot.providerId);
      const memory = await this.dots.readMemory(dot.id);
      let conversation = await this.dots.readConversation(dot.id, conversationId);
      const changedContext = !!conversation.providerId && (conversation.providerId !== dot.providerId || (!!conversation.workspacePath && conversation.workspacePath !== dot.workspacePath));
      const newSession = run.newSession || changedContext;
      if (newSession) conversation = { messages: [], updatedAt: Date.now(), threadId: null };
      threadId = conversation.threadId ?? null;
      const persistConversation = () => this.dots.writeConversation(dot.id, conversationId, { ...conversation, threadId, providerId: dot.providerId, workspacePath: dot.workspacePath, updatedAt: Date.now() });
      const recent = this.runs.listForDot(dot.id, 10).filter((r) => r.id !== run.id);
      const emit = (body: RunEventBody) => { this.runs.addEvent(current, body); };

      const ctx: RunContext = {
        run: current,
        dot,
        prompt: run.prompt,
        context: buildContext({ dot, memory, recentRuns: recent, trigger: run.trigger,
          tasks: this.work?.listTasks(dot.id), followups: this.work?.listFollowups(dot.id) }),
        newSession,
        resumeThreadId: threadId,
        signal: state.controller.signal,
        settings: this.settings.get(),
        emit,
        setThreadId: (id) => { threadId = id; void persistConversation().catch((e) => log.warn('session save failed', e)); },
        requestApproval: async (prompt) => {
          this.activityChanged.emit(dot.id);
          try {
            return await this.approvals.request({ runId: run.id, dotId: dot.id, dotName: dot.name }, prompt, state.controller.signal);
          } finally {
            this.activityChanged.emit(dot.id);
          }
        },
        remember: (note) => this.dots.appendMemory(dot.id, note),
        scheduleFollowup: this.work ? async (prompt, dueAt) => {
          const followup = await this.work!.createFollowup(dot.id, { prompt, dueAt, taskId: run.taskId }, conversationId);
          return followup.id;
        } : undefined,
        thread: {
          read: async () => conversation,
          write: async (messages) => { conversation = { ...conversation, messages }; await persistConversation(); }
        }
      };
      await persistConversation();

      const result = await provider.run(ctx);
      if (state.controller.signal.aborted) throw new CancelledError();

      const authorizeHostAction = async (action: string, args: Record<string, unknown>) => {
        if (state.controller.signal.aborted) throw new CancelledError();
        const rule = matchingRule(dot.permissions, action, args);
        if (rule?.effect === 'deny') throw new Error(`Blocked by the custom permission rule for ${action}.`);
        if (rule?.effect === 'ask' && !await ctx.requestApproval({ kind: 'other', summary: action === 'remember' ? 'Save a memory' : 'Schedule a wakeup', detail: JSON.stringify(args, null, 2).slice(0, 3000) })) {
          throw new Error('The user declined this action.');
        }
      };

      const { text: rememberedText, notes } = extractMemoryUpdates(result.finalMessage);
      const { text, followups } = extractFollowups(rememberedText);
      let savedNotes = 0;
      for (const n of notes) {
        try { await authorizeHostAction('remember', { note: n }); await this.dots.appendMemory(dot.id, n); savedNotes++; }
        catch (err) { this.runs.addEvent(current, { type: 'log', level: 'warn', text: `Could not save memory: ${errorMessage(err)}` }); }
      }
      if (savedNotes) this.runs.addEvent(current, { type: 'log', level: 'info', text: `Saved ${savedNotes} note${savedNotes === 1 ? '' : 's'} to memory.` });
      for (const followup of followups) {
        try {
          if (!this.work) throw new Error('Wakeups are unavailable.');
          await authorizeHostAction('schedule_followup', { prompt: followup.prompt, due_at: new Date(followup.dueAt).toISOString() });
          await this.work.createFollowup(dot.id, { ...followup, taskId: run.taskId }, conversationId);
          this.runs.addEvent(current, { type: 'log', level: 'info', text: `Scheduled a wakeup for ${new Date(followup.dueAt).toLocaleString()}.` });
        } catch (err) {
          this.runs.addEvent(current, { type: 'log', level: 'warn', text: `Could not schedule wakeup: ${errorMessage(err)}` });
        }
      }
      await persistConversation();
      if (state.controller.signal.aborted) throw new CancelledError();

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
    await this.work?.finishRun(done).catch((e) => log.warn('work state save failed', e));
    this.activityChanged.emit(run.dotId);
    this.finished.emit(done);
    this.pump();
  }
}
