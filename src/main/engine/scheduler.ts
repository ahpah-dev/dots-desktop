import type { Dot } from '@shared/types';
import type { DotStore } from '../storage/dotStore';
import type { RunManager } from './runManager';
import { nextRun } from '@shared/schedule';
import { errorMessage } from '../util/misc';
import { createLogger } from '../util/logger';

const log = createLogger('scheduler');
const TICK_MS = 15_000;

/**
 * Fires scheduled tasks. Uses wall-clock comparison on a short tick, so it is robust to system
 * sleep: after waking, any overdue schedule fires once (no pile-up of missed runs).
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private dots: DotStore,
    private runs: RunManager,
    private onDotChanged: (dotId: string) => void
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    setTimeout(() => void this.tick(), 2000).unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
        const sched = dot.schedule;
        if (!sched?.enabled || dot.paused) {
          if (dot.nextRunAt != null) { await this.dots.touch(dot.id, { nextRunAt: null }); this.onDotChanged(dot.id); }
          continue;
        }
        if (dot.nextRunAt == null) {
          await this.dots.touch(dot.id, { nextRunAt: nextRun(sched.spec, now) });
          this.onDotChanged(dot.id);
          continue;
        }
        if (dot.nextRunAt > now) continue;

        // Due. Advance the schedule first so a failure to start can't cause a tight retry loop.
        await this.dots.touch(dot.id, { nextRunAt: nextRun(sched.spec, now) });
        if (this.runs.isBusy(dot.id)) {
          log.info(`Skipping scheduled run for "${dot.name}": still busy.`);
        } else {
          try {
            await this.runs.start(dot.id, sched.prompt, { trigger: 'schedule', newSession: !sched.continueSession });
          } catch (err) {
            log.warn(`Scheduled run for "${dot.name}" could not start: ${errorMessage(err)}`);
          }
        }
        this.onDotChanged(dot.id);
      }
    } catch (err) {
      log.error('tick failed', err);
    } finally {
      this.ticking = false;
    }
  }
}
