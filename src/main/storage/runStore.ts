import { promises as fs } from 'node:fs';
import type { Run, RunEvent, RunEventBody } from '@shared/types';
import { readJson, writeJson } from '../util/jsonStore';
import type { Paths } from '../util/paths';
import { Emitter, uid, firstLine } from '../util/misc';
import { createLogger } from '../util/logger';

const log = createLogger('runs');
const MAX_RUNS_PER_DOT = 200;
const MAX_EVENT_TEXT = 60_000;

/** Persists run metadata (json) and the event stream (jsonl) for every Dot task. */
export class RunStore {
  private runs = new Map<string, Run>(); // by run id
  private seq = new Map<string, number>();
  private appendChains = new Map<string, Promise<void>>();

  readonly runChanged = new Emitter<Run>();
  readonly eventAdded = new Emitter<RunEvent>();

  constructor(private paths: Paths) {}

  /** Load all runs. Anything still queued/running was cut off by a shutdown or crash → `interrupted`. */
  async init(dotIds: string[]): Promise<void> {
    for (const dotId of dotIds) {
      let files: string[] = [];
      try {
        files = (await fs.readdir(this.paths.runsDir(dotId))).filter((f) => f.endsWith('.json'));
      } catch {
        continue;
      }
      for (const f of files) {
        const run = await readJson<Run | null>(`${this.paths.runsDir(dotId)}/${f}`, null).catch(() => null);
        if (!run?.id) continue;
        if (run.status === 'queued' || run.status === 'running') {
          run.status = 'interrupted';
          run.endedAt = Date.now();
          run.error = 'The app was closed while this task was in progress.';
          await writeJson(this.paths.runFile(dotId, run.id), run).catch((e) => log.error(e));
        }
        this.runs.set(run.id, run);
      }
    }
  }

  get(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  listForDot(dotId: string, limit = 50): Run[] {
    return [...this.runs.values()]
      .filter((r) => r.dotId === dotId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  async create(input: Pick<Run, 'dotId' | 'trigger' | 'prompt' | 'newSession'>): Promise<Run> {
    const run: Run = {
      id: uid(),
      dotId: input.dotId,
      trigger: input.trigger,
      prompt: input.prompt,
      newSession: input.newSession,
      title: firstLine(input.prompt, 90) || 'Untitled task',
      status: 'queued',
      createdAt: Date.now()
    };
    this.runs.set(run.id, run);
    await this.persist(run);
    this.runChanged.emit(run);
    void this.prune(input.dotId);
    return run;
  }

  async update(runId: string, patch: Partial<Run>): Promise<Run> {
    const cur = this.runs.get(runId);
    if (!cur) throw new Error('Run not found');
    const next = { ...cur, ...patch };
    this.runs.set(runId, next);
    await this.persist(next);
    this.runChanged.emit(next);
    return next;
  }

  private persist(run: Run): Promise<void> {
    return writeJson(this.paths.runFile(run.dotId, run.id), run);
  }

  /** Append an event to the run's log and notify listeners. Never throws. */
  addEvent(run: Pick<Run, 'id' | 'dotId'>, body: RunEventBody): RunEvent {
    if (body.type === 'draft') {
      const draft = { ...body, runId: run.id, dotId: run.dotId, seq: 0, ts: Date.now() } as RunEvent;
      this.eventAdded.emit(draft);
      return draft;
    }
    const seq = (this.seq.get(run.id) ?? 0) + 1;
    this.seq.set(run.id, seq);
    const event = { ...clipBody(body), runId: run.id, dotId: run.dotId, seq, ts: Date.now() } as RunEvent;
    const file = this.paths.runEventsFile(run.dotId, run.id);
    const prev = this.appendChains.get(file) ?? Promise.resolve();
    const next = prev
      .then(async () => {
        await fs.mkdir(this.paths.runsDir(run.dotId), { recursive: true });
        await fs.appendFile(file, `${JSON.stringify(event)}\n`, 'utf8');
      })
      .catch((e) => log.error('append event failed', e));
    this.appendChains.set(file, next);
    void next.finally(() => { if (this.appendChains.get(file) === next) this.appendChains.delete(file); });
    this.eventAdded.emit(event);
    return event;
  }

  async events(runId: string): Promise<RunEvent[]> {
    const run = this.runs.get(runId);
    if (!run) return [];
    await this.appendChains.get(this.paths.runEventsFile(run.dotId, runId));
    let raw = '';
    try {
      raw = await fs.readFile(this.paths.runEventsFile(run.dotId, runId), 'utf8');
    } catch {
      return [];
    }
    const out: RunEvent[] = [];
    for (const line of raw.split('\n')) {
      if (!line) continue;
      try { out.push(JSON.parse(line) as RunEvent); } catch { /* skip a torn final line */ }
    }
    return out;
  }

  async delete(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return;
    if (run.status === 'running' || run.status === 'queued') throw new Error('Stop the task before deleting it.');
    this.runs.delete(runId);
    await fs.rm(this.paths.runFile(run.dotId, runId), { force: true });
    await fs.rm(this.paths.runEventsFile(run.dotId, runId), { force: true });
  }

  private async prune(dotId: string): Promise<void> {
    const all = this.listForDot(dotId, Number.MAX_SAFE_INTEGER);
    const stale = all.slice(MAX_RUNS_PER_DOT).filter((r) => r.status !== 'running' && r.status !== 'queued');
    for (const r of stale) await this.delete(r.id).catch(() => undefined);
  }
}

function clipBody(body: RunEventBody): RunEventBody {
  const clip = (s: string | undefined) =>
    s && s.length > MAX_EVENT_TEXT ? `${s.slice(0, MAX_EVENT_TEXT / 2)}\n… [truncated] …\n${s.slice(-MAX_EVENT_TEXT / 2)}` : s;
  switch (body.type) {
    case 'tool':
      return { ...body, input: clip(body.input), output: clip(body.output) };
    case 'message':
    case 'reasoning':
    case 'final':
    case 'user':
    case 'log':
      return { ...body, text: clip(body.text) ?? '' };
    default:
      return body;
  }
}
