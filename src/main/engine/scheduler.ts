import type { Dot, DotTask, Followup } from '@shared/types';
import type { DotStore } from '../storage/dotStore';
import type { RunManager } from './runManager';
import type { WorkStore } from '../storage/workStore';
import { nextRun } from '@shared/schedule';
import { errorMessage } from '../util/misc';
import { createLogger } from '../util/logger';

const log = createLogger('scheduler');
const TICK_MS = 15_000;
type DueWork = { due: number; kind: 'schedule' } | { due: number; kind: 'task'; task: DotTask } | { due: number; kind: 'followup'; followup: Followup };

/**
 * Fires scheduled tasks. Uses wall-clock comparison on a short tick, so it is robust to system
 * sleep: after waking, any overdue schedule fires once (no pile-up of missed runs).
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private dots: DotStore,
    private runs: RunManager,
    private onDotChanged: (dotId: string) => void,
    private work?: WorkStore
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    this.startupTimer = setTimeout(() => { this.startupTimer = null; void this.tick(); }, 2000);
    this.startupTimer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.timer = null;
    this.startupTimer = null;
  }

  /** Compute the next fire time for a Dot after its schedule/paused state changed. */
  async refresh(dot: Dot): Promise<Dot> {
    const next = dot.schedule?.enabled && !dot.paused ? nextRun(dot.schedule.spec, Date.now()) : null;
    if ((dot.nextRunAt ?? null) === next) return dot;
    return (await this.dots.touch(dot.id, { nextRunAt: next })) ?? dot;
  }

  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      for (const dot of this.dots.list()) {
        try { await this.tickDot(dot, now); }
        catch (err) { log.warn(`Scheduled work for "${dot.name}" could not start: ${errorMessage(err)}`); }
      }
    } finally {
      this.ticking = false;
    }
  }

  private async tickDot(dot: Dot, now: number): Promise<void> {
    const candidates: DueWork[] = [];
    const schedule = dot.schedule;
    if (!schedule?.enabled || dot.paused) {
      if (dot.nextRunAt != null) { await this.dots.touch(dot.id, { nextRunAt: null }); this.onDotChanged(dot.id); }
    } else if (dot.nextRunAt == null) {
      await this.dots.touch(dot.id, { nextRunAt: nextRun(schedule.spec, now) });
      this.onDotChanged(dot.id);
    } else if (dot.nextRunAt <= now) candidates.push({ due: dot.nextRunAt, kind: 'schedule' });
    if (dot.paused) return;

    if (this.work) {
      for (const task of this.work.listTasks(dot.id)) {
        if (task.status !== 'active' || !task.schedule) continue;
        if (task.nextRunAt == null) { await this.work.touchTask(task.id, { nextRunAt: nextRun(task.schedule, now) }); continue; }
        if (task.nextRunAt <= now) candidates.push({ due: task.nextRunAt, kind: 'task', task });
      }
      for (const followup of this.work.listFollowups(dot.id)) {
        if (followup.status !== 'pending' || followup.dueAt > now) continue;
        if (followup.taskId && this.work.task(followup.taskId).status !== 'active') continue;
        candidates.push({ due: followup.dueAt, kind: 'followup', followup });
      }
    }
    if (this.runs.isBusy(dot.id) || this.dots.require(dot.id).paused) return;
    const next = candidates.sort((a, b) => a.due - b.due)[0];
    if (!next) return;

    if (next.kind === 'schedule' && schedule) {
      await this.dots.touch(dot.id, { nextRunAt: nextRun(schedule.spec, now) });
      await this.runs.start(dot.id, schedule.prompt, { trigger: 'schedule', newSession: !schedule.continueSession });
      this.onDotChanged(dot.id);
    } else if (next.kind === 'task') {
      const task = this.work!.task(next.task.id);
      if (task.status !== 'active' || !task.schedule) return;
      await this.work!.touchTask(task.id, { nextRunAt: nextRun(task.schedule, now) });
      const run = await this.runs.start(dot.id, task.prompt, { trigger: 'schedule', newSession: !task.continueSession, conversationId: task.conversationId, taskId: task.id });
      await this.work!.touchTask(task.id, { lastRunId: run.id });
    } else if (next.kind === 'followup') {
      const followup = this.work!.followup(next.followup.id);
      if (followup.status !== 'pending') return;
      await this.work!.updateFollowup(followup.id, { status: 'running', error: undefined });
      try {
        const run = await this.runs.start(dot.id, followup.prompt, { trigger: 'followup', conversationId: followup.conversationId, taskId: followup.taskId, followupId: followup.id });
        await this.work!.updateFollowup(followup.id, { runId: run.id });
        if (this.work!.followup(followup.id).status === 'cancelled') await this.runs.cancel(run.id);
      } catch (err) {
        await this.work!.updateFollowup(followup.id, { status: 'failed', error: errorMessage(err) });
        throw err;
      }
    }
  }
}
