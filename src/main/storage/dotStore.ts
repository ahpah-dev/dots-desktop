import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import {
  DEFAULT_BUDGET,
  DEFAULT_PERMISSIONS,
  type Budget,
  type Dot,
  type DotInput,
  type DotPatch,
  type Permissions
} from '@shared/types';
import { readJson, writeJson } from '../util/jsonStore';
import type { Paths } from '../util/paths';
import { uid } from '../util/misc';
import { validateSpec } from '@shared/schedule';
import { createLogger } from '../util/logger';

const log = createLogger('dots');

/** Conversation history kept per Dot for providers that don't manage their own sessions. */
export interface StoredThread {
  messages: unknown[];
  updatedAt: number;
}

export class DotStore {
  private dots = new Map<string, Dot>();

  constructor(private paths: Paths) {}

  async init(): Promise<void> {
    await fs.mkdir(this.paths.dots, { recursive: true });
    const entries = await fs.readdir(this.paths.dots, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const dot = await readJson<Dot | null>(this.paths.dotFile(e.name), null);
        if (dot?.id) {
          const normalized = this.normalize(dot);
          this.dots.set(dot.id, normalized);
          if (dot.model !== normalized.model) {
            await this.save(normalized);
          }
        }
      } catch (err) {
        log.error('Failed to load dot', e.name, err);
      }
    }
  }

  list(): Dot[] {
    return [...this.dots.values()].sort((a, b) => a.createdAt - b.createdAt);
  }

  get(id: string): Dot | undefined {
    return this.dots.get(id);
  }

  require(id: string): Dot {
    const d = this.dots.get(id);
    if (!d) throw new Error('This Dot no longer exists.');
    return d;
  }

  async create(input: DotInput, workspacePath: string): Promise<Dot> {
    const now = Date.now();
    const dot = this.normalize({
      id: uid(),
      name: input.name,
      description: input.description,
      color: input.color,
      emoji: input.emoji,
      instructions: input.instructions,
      providerId: input.providerId,
      model: input.model,
      reasoningEffort: input.reasoningEffort,
      workspacePath,
      permissions: input.permissions,
      budget: input.budget ?? DEFAULT_BUDGET,
      schedule: input.schedule ?? null,
      paused: false,
      notify: input.notify,
      createdAt: now,
      updatedAt: now,
      threadId: null
    });
    await fs.mkdir(workspacePath, { recursive: true });
    await this.save(dot);
    return dot;
  }

  async update(id: string, patch: DotPatch): Promise<Dot> {
    const cur = this.require(id);
    const next = this.normalize({ ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: Date.now() });
    if (next.workspacePath !== cur.workspacePath) {
      await fs.mkdir(next.workspacePath, { recursive: true });
      next.threadId = null; // a different workspace is a different conversation context
      await this.writeThread(id, { messages: [], updatedAt: Date.now() });
    }
    await this.save(next);
    return next;
  }

  /** Internal bookkeeping updates (run timestamps, thread ids) that shouldn't bump `updatedAt`. */
  async touch(id: string, patch: Partial<Dot>): Promise<Dot | undefined> {
    const cur = this.dots.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    await this.save(next);
    return next;
  }

  async delete(id: string): Promise<Dot> {
    const dot = this.require(id);
    this.dots.delete(id);
    await fs.rm(this.paths.dotDir(id), { recursive: true, force: true });
    return dot;
  }

  private async save(dot: Dot): Promise<void> {
    this.dots.set(dot.id, dot);
    await writeJson(this.paths.dotFile(dot.id), dot);
  }

  private normalize(d: Dot): Dot {
    const perms: Permissions = { ...DEFAULT_PERMISSIONS, ...d.permissions };
    const budget: Budget = {
      maxMinutes: clampInt(d.budget?.maxMinutes, 1, 24 * 60, DEFAULT_BUDGET.maxMinutes),
      maxSteps: clampInt(d.budget?.maxSteps, 1, 500, DEFAULT_BUDGET.maxSteps)
    };
    const name = d.name.trim();
    if (!name) throw new Error('Give your Dot a name.');
    let schedule = d.schedule;
    if (schedule) {
      validateSpec(schedule.spec);
      schedule = { ...schedule, prompt: schedule.prompt ?? '', continueSession: !!schedule.continueSession };
      if (schedule.enabled && !schedule.prompt.trim()) throw new Error('A scheduled Dot needs a task to run.');
    }

    let model = d.model;
    if (model) {
      const lower = model.toLowerCase().trim();
      if (lower === 'gpt-6.1' || lower === 'gpt-6.1-base' || lower === 'gpt-6.1-frontier') {
        model = 'gpt-6.1-sol';
      } else if (lower === 'gpt-6' || lower === 'gpt-6-base' || lower === 'gpt-6-frontier') {
        model = 'gpt-6-astra';
      } else if (lower === 'gpt-5.6-cyber' || lower === 'gpt-reserve') {
        model = 'gpt-5.6-sol';
      }
    }

    return { ...d, name, model, permissions: perms, budget, schedule, description: d.description ?? '', instructions: d.instructions ?? '' };
  }

  // ── memory ──
  async readMemory(id: string): Promise<string> {
    try {
      return await fs.readFile(this.paths.memoryFile(id), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return '';
      throw err;
    }
  }

  async writeMemory(id: string, text: string): Promise<void> {
    this.require(id);
    await fs.mkdir(this.paths.dotDir(id), { recursive: true });
    const file = this.paths.memoryFile(id);
    const tmp = join(this.paths.dotDir(id), 'memory.md.tmp');
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, file);
  }

  async appendMemory(id: string, note: string): Promise<void> {
    const cur = (await this.readMemory(id)).trimEnd();
    const stamp = new Date().toISOString().slice(0, 10);
    const entry = note.trim().split('\n').map((l) => (l.startsWith('- ') ? l : `- ${l}`)).join('\n');
    await this.writeMemory(id, `${cur}${cur ? '\n' : ''}${entry} _(${stamp})_\n`);
  }

  // ── thread (for providers that keep history locally) ──
  async readThread(id: string): Promise<StoredThread> {
    return readJson<StoredThread>(this.paths.threadFile(id), { messages: [], updatedAt: 0 });
  }

  async writeThread(id: string, thread: StoredThread): Promise<void> {
    if (!this.dots.has(id)) return;
    await writeJson(this.paths.threadFile(id), thread);
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
