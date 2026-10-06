import type { DotTask, DotTaskInput, DotTaskPatch, Followup, FollowupInput, Run } from '@shared/types';
import { nextRun, validateSpec } from '@shared/schedule';
import { readJson, writeJson } from '../util/jsonStore';
import { Emitter, uid } from '../util/misc';
import type { Paths } from '../util/paths';
import type { DotStore } from './dotStore';

interface WorkData { tasks: DotTask[]; followups: Followup[] }

/** Durable responsibilities and wakeups. State is saved before a run is dispatched. */
export class WorkStore {
  private data = new Map<string, WorkData>();
  readonly changed = new Emitter<string>();

  constructor(private paths: Paths, private dots: DotStore) {}

  async init(getRun: (id: string) => Run | undefined): Promise<void> {
    for (const dot of this.dots.list()) {
      const data = await readJson<WorkData>(this.paths.workFile(dot.id), { tasks: [], followups: [] });
      data.tasks = Array.isArray(data.tasks) ? data.tasks.filter((t) => t.dotId === dot.id) : [];
      data.followups = Array.isArray(data.followups) ? data.followups.filter((f) => f.dotId === dot.id) : [];
      for (const f of data.followups) {
        if (f.status !== 'running') continue;
        const run = f.runId ? getRun(f.runId) : undefined;
        // A crashed action may already have had external effects. Never silently replay it.
        f.status = run?.status === 'succeeded' ? 'completed' : 'failed';
        f.error = f.status === 'failed' ? 'The app closed during this wakeup. Review its activity before scheduling another.' : undefined;
        f.updatedAt = Date.now();
      }
      this.data.set(dot.id, data);
      await this.persist(dot.id);
    }
  }

  private forDot(dotId: string): WorkData {
    this.dots.require(dotId);
    let data = this.data.get(dotId);
    if (!data) { data = { tasks: [], followups: [] }; this.data.set(dotId, data); }
    return data;
  }

  listTasks(dotId: string): DotTask[] { return [...this.forDot(dotId).tasks].sort((a, b) => b.createdAt - a.createdAt); }
  listFollowups(dotId: string): Followup[] { return [...this.forDot(dotId).followups].sort((a, b) => a.dueAt - b.dueAt); }

  task(id: string): DotTask {
    for (const data of this.data.values()) { const task = data.tasks.find((t) => t.id === id); if (task) return task; }
    throw new Error('This responsibility no longer exists.');
  }

  followup(id: string): Followup {
    for (const data of this.data.values()) { const followup = data.followups.find((f) => f.id === id); if (followup) return followup; }
    throw new Error('This wakeup no longer exists.');
  }

  async createTask(dotId: string, input: DotTaskInput): Promise<DotTask> {
    const data = this.forDot(dotId);
    if (data.tasks.length >= 100) throw new Error('A Dot can have up to 100 responsibilities.');
    const now = Date.now();
    const schedule = input.schedule ?? null;
    if (schedule) validateSpec(schedule);
    const task: DotTask = {
      id: uid(), dotId, title: requiredText(input.title, 'Give this responsibility a title.', 160),
      prompt: requiredText(input.prompt, 'Describe this responsibility.', 50_000), status: 'active',
      schedule, continueSession: input.continueSession ?? true, conversationId: uid(),
      nextRunAt: schedule ? nextRun(schedule, now) : null, createdAt: now, updatedAt: now
    };
    data.tasks.push(task);
    await this.persist(dotId);
    this.changed.emit(dotId);
    return task;
  }

  async updateTask(id: string, patch: DotTaskPatch): Promise<DotTask> {
    const cur = this.task(id);
    const task: DotTask = { ...cur, ...patch, updatedAt: Date.now() };
    task.title = requiredText(task.title, 'Give this responsibility a title.', 160);
    task.prompt = requiredText(task.prompt, 'Describe this responsibility.', 50_000);
    if (!['active', 'paused', 'completed'].includes(task.status)) throw new Error('Invalid responsibility status.');
    if (task.schedule) validateSpec(task.schedule);
    if (patch.schedule !== undefined || patch.status !== undefined) {
      task.nextRunAt = task.status === 'active' && task.schedule ? nextRun(task.schedule, Date.now()) : null;
    }
    const data = this.forDot(task.dotId);
    data.tasks = data.tasks.map((t) => t.id === id ? task : t);
    await this.persist(task.dotId);
    this.changed.emit(task.dotId);
    return task;
  }

  async touchTask(id: string, patch: Partial<Pick<DotTask, 'lastRunId' | 'lastRunAt' | 'nextRunAt'>>): Promise<void> {
    const task = this.task(id);
    Object.assign(task, patch, { updatedAt: Date.now() });
    await this.persist(task.dotId);
    this.changed.emit(task.dotId);
  }

  async deleteTask(id: string): Promise<void> {
    const task = this.task(id);
    const data = this.forDot(task.dotId);
    data.tasks = data.tasks.filter((t) => t.id !== id);
    for (const f of data.followups) {
      if (f.taskId === id && f.status === 'pending') { f.status = 'cancelled'; f.updatedAt = Date.now(); }
    }
    await this.persist(task.dotId);
    this.changed.emit(task.dotId);
  }

  async createFollowup(dotId: string, input: FollowupInput, conversationId?: string): Promise<Followup> {
    const data = this.forDot(dotId);
    if (!Number.isFinite(input.dueAt) || !Number.isFinite(new Date(input.dueAt).getTime()) || input.dueAt <= Date.now() - 60_000) throw new Error('Choose a future time for this wakeup.');
    if (data.followups.filter((f) => f.status === 'pending' || f.status === 'running').length >= 100) throw new Error('A Dot can have up to 100 pending wakeups.');
    if (input.taskId && this.task(input.taskId).dotId !== dotId) throw new Error('That responsibility belongs to another Dot.');
    const now = Date.now();
    const followup: Followup = {
      id: uid(), dotId, prompt: requiredText(input.prompt, 'Describe what to do on wakeup.', 50_000),
      dueAt: input.dueAt, status: 'pending', conversationId: conversationId ?? (input.taskId ? this.task(input.taskId).conversationId : uid()), taskId: input.taskId, createdAt: now, updatedAt: now
    };
    data.followups.push(followup);
    // Retain a bounded log of terminal wakeups without dropping pending work.
    if (data.followups.length > 500) {
      const terminal = data.followups.filter((f) => f.status !== 'pending' && f.status !== 'running').sort((a, b) => b.updatedAt - a.updatedAt);
      const keep = new Set(terminal.slice(0, 400).map((f) => f.id));
      data.followups = data.followups.filter((f) => f.status === 'pending' || f.status === 'running' || keep.has(f.id));
    }
    await this.persist(dotId);
    this.changed.emit(dotId);
    return followup;
  }

  async updateFollowup(id: string, patch: Partial<Pick<Followup, 'status' | 'runId' | 'error'>>): Promise<Followup> {
    const followup = this.followup(id);
    Object.assign(followup, patch, { updatedAt: Date.now() });
    await this.persist(followup.dotId);
    this.changed.emit(followup.dotId);
    return followup;
  }

  async finishRun(run: Run): Promise<void> {
    if (run.taskId) {
      try { await this.touchTask(run.taskId, { lastRunId: run.id, lastRunAt: run.endedAt }); } catch { /* responsibility was deleted */ }
    }
    if (run.followupId) {
      try {
        const followup = this.followup(run.followupId);
        if (followup.status !== 'cancelled') {
          await this.updateFollowup(followup.id, { runId: run.id, status: run.status === 'succeeded' ? 'completed' : run.status === 'cancelled' ? 'cancelled' : 'failed', error: run.error });
        }
      } catch { /* Dot was deleted */ }
    }
  }

  forgetDot(dotId: string): void { this.data.delete(dotId); }

  private persist(dotId: string): Promise<void> {
    return writeJson(this.paths.workFile(dotId), this.forDot(dotId));
  }
}

function requiredText(text: string, message: string, max: number): string {
  if (typeof text !== 'string' || !text.trim()) throw new Error(message);
  if (text.length > max) throw new Error(`Keep the text under ${max.toLocaleString()} characters.`);
  return text.trim();
}
