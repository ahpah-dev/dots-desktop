import { promises as fs } from 'node:fs';
import {
  DEFAULT_BUDGET,
  DEFAULT_PERMISSIONS,
  type Budget,
  type Dot,
  type DotInput,
  type DotPatch,
  type MemoryNote,
  type MemoryNoteInput,
  type Permissions
} from '@shared/types';
import { readJson, writeJson } from '../util/jsonStore';
import type { Paths } from '../util/paths';
import { Emitter, uid } from '../util/misc';
import { validateSpec } from '@shared/schedule';
import { createLogger } from '../util/logger';

const log = createLogger('dots');

/** Conversation history kept per Dot for providers that don't manage their own sessions. */
export interface StoredThread {
  messages: unknown[];
  updatedAt: number;
  threadId?: string | null;
  providerId?: string;
  workspacePath?: string;
}

export class DotStore {
  private dots = new Map<string, Dot>();
  private notes = new Map<string, MemoryNote[]>();
  readonly memoryChanged = new Emitter<string>();

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
          const savedNotes = await readJson<MemoryNote[] | null>(this.paths.memoryNotesFile(dot.id), null);
          if (savedNotes) this.notes.set(dot.id, savedNotes);
          else {
            let legacy = '';
            try { legacy = await fs.readFile(this.paths.memoryFile(dot.id), 'utf8'); } catch { /* no legacy memory */ }
            this.notes.set(dot.id, this.importMemory(dot.id, legacy));
            await writeJson(this.paths.memoryNotesFile(dot.id), this.notes.get(dot.id));
          }
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
      avatar: input.avatar,
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
      next.sessionResetAt = Date.now();
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
    this.notes.delete(id);
    await fs.rm(this.paths.dotDir(id), { recursive: true, force: true });
    return dot;
  }

  private async save(dot: Dot): Promise<void> {
    this.dots.set(dot.id, dot);
    await writeJson(this.paths.dotFile(dot.id), dot);
  }

  private normalize(d: Dot): Dot {
    const perms: Permissions = { ...DEFAULT_PERMISSIONS, ...d.permissions };
    perms.talkToDots = perms.talkToDots === true;
    if (perms.rules) {
      if (!Array.isArray(perms.rules) || perms.rules.length > 50) throw new Error('Use up to 50 custom permission rules.');
      perms.rules = perms.rules.map((rule) => {
        if (!rule.action?.trim() || !['allow', 'ask', 'deny'].includes(rule.effect)) throw new Error('Invalid custom permission rule.');
        return { id: rule.id || uid(), action: rule.action.trim(), effect: rule.effect, pattern: rule.pattern?.trim() || undefined };
      });
    }
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
    return this.listMemoryNotes(id).map((note) => `- [${note.category}] ${note.text}`).join('\n');
  }

  async writeMemory(id: string, text: string): Promise<void> {
    this.require(id);
    this.notes.set(id, this.importMemory(id, text));
    await this.persistMemory(id);
  }

  async appendMemory(id: string, note: string): Promise<void> {
    const text = note.trim();
    if (!text) return;
    const existing = this.listMemoryNotes(id).find((n) => n.text.toLowerCase() === text.toLowerCase());
    if (existing) return;
    await this.saveMemoryNote(id, { text, category: 'fact' }, 'agent');
  }

  listMemoryNotes(id: string): MemoryNote[] {
    this.require(id);
    return [...(this.notes.get(id) ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async saveMemoryNote(id: string, input: MemoryNoteInput, source: MemoryNote['source'] = 'manual'): Promise<MemoryNote> {
    this.require(id);
    const text = input.text?.trim();
    if (!text) throw new Error('Write something to remember.');
    if (text.length > 4000) throw new Error('Keep each memory under 4,000 characters.');
    if (!['preference', 'fact', 'decision', 'project'].includes(input.category)) throw new Error('Invalid memory category.');
    const notes = this.notes.get(id) ?? [];
    const current = input.id ? notes.find((n) => n.id === input.id) : undefined;
    if (input.id && !current) throw new Error('That memory no longer exists.');
    if (!current && notes.length >= 500) throw new Error('A Dot can remember up to 500 notes. Remove an older note first.');
    const now = Date.now();
    const note: MemoryNote = { id: current?.id ?? uid(), dotId: id, text, category: input.category, source, createdAt: current?.createdAt ?? now, updatedAt: now };
    this.notes.set(id, current ? notes.map((n) => n.id === note.id ? note : n) : [...notes, note]);
    await this.persistMemory(id);
    return note;
  }

  async deleteMemoryNote(id: string, noteId: string): Promise<void> {
    this.require(id);
    this.notes.set(id, (this.notes.get(id) ?? []).filter((n) => n.id !== noteId));
    await this.persistMemory(id);
  }

  private importMemory(id: string, text: string): MemoryNote[] {
    const now = Date.now();
    return text.split('\n').map((line) => line.replace(/^\s*[-*•]\s*/, '').replace(/\s*_\(\d{4}-\d{2}-\d{2}\)_\s*$/, '').trim())
      .filter((line) => line && !line.startsWith('#')).slice(0, 500)
      .map((line) => {
        const tagged = /^\[(preference|fact|decision|project)\]\s*(.*)$/.exec(line);
        return { id: uid(), dotId: id, text: tagged?.[2] ?? line, category: (tagged?.[1] ?? 'fact') as MemoryNote['category'], source: 'manual' as const, createdAt: now, updatedAt: now };
      });
  }

  private async persistMemory(id: string): Promise<void> {
    await writeJson(this.paths.memoryNotesFile(id), this.notes.get(id) ?? []);
    this.memoryChanged.emit(id);
  }

  // ── thread (for providers that keep history locally) ──
  async readThread(id: string): Promise<StoredThread> {
    return readJson<StoredThread>(this.paths.threadFile(id), { messages: [], updatedAt: 0 });
  }

  async writeThread(id: string, thread: StoredThread): Promise<void> {
    if (!this.dots.has(id)) return;
    await writeJson(this.paths.threadFile(id), thread);
  }

  async readConversation(id: string, conversationId: string): Promise<StoredThread> {
    this.require(id);
    this.validateConversationId(conversationId);
    const stored = await readJson<StoredThread | null>(this.paths.conversationFile(id, conversationId), null);
    if (stored) return stored;
    if (conversationId === `legacy-${id}`) {
      return { ...await this.readThread(id), threadId: this.require(id).threadId, providerId: this.require(id).providerId };
    }
    return { messages: [], updatedAt: 0 };
  }

  async writeConversation(id: string, conversationId: string, thread: StoredThread): Promise<void> {
    this.require(id);
    this.validateConversationId(conversationId);
    await writeJson(this.paths.conversationFile(id, conversationId), thread);
  }

  private validateConversationId(id: string): void {
    if (!/^[\w-]{1,100}$/.test(id)) throw new Error('Invalid conversation id.');
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
