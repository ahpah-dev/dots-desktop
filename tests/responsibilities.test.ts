import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PERMISSIONS, type DotInput, type Run } from '@shared/types';
import { Paths } from '../src/main/util/paths';
import { DotStore } from '../src/main/storage/dotStore';
import { RunStore } from '../src/main/storage/runStore';
import { WorkStore } from '../src/main/storage/workStore';
import { SettingsStore, defaultSettings } from '../src/main/storage/settingsStore';
import { RunManager } from '../src/main/engine/runManager';
import { Scheduler } from '../src/main/engine/scheduler';
import { ApprovalGate } from '../src/main/engine/approvals';
import { extractFollowups } from '../src/main/engine/context';
import { CodexEventTranslator } from '../src/main/providers/codex/events';
import { authorizeTool, matchingRule } from '../src/main/tools/permissions';
import { scheduleFollowupTool } from '../src/main/tools/registry';
import { searchFiles } from '../src/main/tools/files';
import { CodexProvider } from '../src/main/providers/codex/provider';
import type { ProviderRegistry } from '../src/main/providers/registry';
import { CancelledError, type AgentProvider, type RunContext } from '../src/main/providers/types';

const cleanup: { path: string; manager?: RunManager }[] = [];
afterEach(async () => {
  for (const entry of cleanup.splice(0)) {
    await entry.manager?.shutdown();
    await fs.rm(entry.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

const input: DotInput = {
  name: 'Research partner', description: '', color: '#5b8173', emoji: '🟢', instructions: '',
  providerId: 'mock', model: 'auto', permissions: DEFAULT_PERMISSIONS, notify: false
};

async function setup(provider?: AgentProvider) {
  const path = await fs.mkdtemp(join(tmpdir(), 'dots-responsibilities-'));
  const entry: { path: string; manager?: RunManager } = { path }; cleanup.push(entry);
  const paths = new Paths(join(path, 'data'));
  const dots = new DotStore(paths); await dots.init();
  const dot = await dots.create(input, join(path, 'workspace'));
  const runs = new RunStore(paths); await runs.init([dot.id]);
  const work = new WorkStore(paths, dots); await work.init((id) => runs.get(id));
  const settings = new SettingsStore(paths.settings, defaultSettings(join(path, 'workspaces'))); await settings.init();
  await settings.update({ maxConcurrentRuns: 2 });
  const registry = { get: () => provider } as unknown as ProviderRegistry;
  const manager = new RunManager(dots, runs, registry, settings, new ApprovalGate(), work); entry.manager = manager;
  return { path, paths, dots, dot, runs, work, manager };
}

async function until(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the engine.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function provider(run: AgentProvider['run']): AgentProvider {
  return { id: 'mock', label: 'Mock', run, listModels: async () => [], test: async () => ({ ok: true, message: '' }) };
}

describe('durable responsibilities, memories and wakeups', () => {
  it('persists project context separately and preserves file references when a coding message is edited', async () => {
    const prompts: string[] = [];
    const f = await setup(provider(async ctx => { prompts.push(ctx.prompt); return { finalMessage: 'Implemented and checked.' }; }));
    const project = { intent: 'fix' as const, files: ['src/app.ts'] };
    const run = await f.manager.start(f.dot.id, 'Fix the button.', { trigger: 'manual', newSession: true, project });
    await until(() => f.runs.get(run.id)?.status === 'succeeded' && !f.manager.isBusy(f.dot.id));
    expect(f.runs.get(run.id)?.prompt).toBe('Fix the button.');
    expect(prompts[0]).toContain('Workspace file references');
    expect(prompts[0]).toContain('src/app.ts');
    const revised = await f.manager.reviseMessage(run.id, 'Fix the button and its label.');
    await until(() => f.runs.get(revised.id)?.status === 'succeeded');
    expect(revised.project).toEqual(project);
    expect(revised.prompt).toBe('Fix the button and its label.');
    expect(prompts[1]).toContain('src/app.ts');
    const reloaded = new RunStore(f.paths); await reloaded.init([f.dot.id]);
    expect(reloaded.get(revised.id)?.project).toEqual(project);
  });
  it.each([50000, 90000])('retains a confirmed Codex answer when final usage reaches %i tokens', async (inputTokens) => {
    const usage = { inputTokens, outputTokens: 700, cachedTokens: 40000 };
    const f = await setup(provider(async (ctx) => {
      const translator = new CodexEventTranslator(ctx.emit, ctx.setThreadId);
      translator.handle({ type: 'turn.started' });
      translator.handle({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text: 'Completed and verified.' } });
      translator.handle({ type: 'turn.completed', usage: { input_tokens: inputTokens, output_tokens: 700, cached_input_tokens: 40000 } });
      expect(ctx.signal.aborted).toBe(false);
      return { finalMessage: translator.finalMessage, usage: translator.usage };
    }));
    await f.dots.update(f.dot.id, { providerId: 'codex', budget: { maxMinutes: 30, maxSteps: 60, maxTokens: 50000, enforceLimits: true } });
    const run = await f.manager.start(f.dot.id, 'Complete a task', { trigger: 'manual' });
    await until(() => !f.manager.isBusy(f.dot.id));
    expect(f.runs.get(run.id)).toMatchObject({ status: 'succeeded', finalMessage: 'Completed and verified.', usage });
    expect(f.runs.get(run.id)?.error).toBeUndefined();
    expect(await f.runs.events(run.id)).toContainEqual(expect.objectContaining({ type: 'final', text: 'Completed and verified.' }));
    const reload = new RunStore(f.paths); await reload.init([f.dot.id]);
    expect(reload.get(run.id)?.status).toBe('succeeded');
  });

  it('still stops a live over-budget Codex task even after an intermediate message', async () => {
    const f = await setup(provider(async (ctx) => {
      ctx.emit({ type: 'message', id: 'progress', text: 'Work is in progress.' });
      ctx.emit({ type: 'usage', usage: { inputTokens: 50000, outputTokens: 10 } });
      expect(ctx.signal.aborted).toBe(true);
      throw new CancelledError();
    }));
    await f.dots.update(f.dot.id, { providerId: 'codex', budget: { maxMinutes: 30, maxSteps: 60, enforceLimits: true } });
    const run = await f.manager.start(f.dot.id, 'Continue working', { trigger: 'manual' });
    await until(() => !f.manager.isBusy(f.dot.id));
    expect(f.runs.get(run.id)).toMatchObject({ status: 'failed', error: 'Stopped after reaching the task token budget.' });
    expect(f.runs.get(run.id)?.finalMessage).toBeUndefined();
  });

  it('does not hide a real provider failure after a displayed message', async () => {
    const f = await setup(provider(async (ctx) => {
      ctx.emit({ type: 'message', id: 'progress', text: 'A partial answer.' });
      throw new Error('Provider connection failed before completion.');
    }));
    await f.dots.update(f.dot.id, { providerId: 'codex' });
    const run = await f.manager.start(f.dot.id, 'Continue working', { trigger: 'manual' });
    await until(() => !f.manager.isBusy(f.dot.id));
    expect(f.runs.get(run.id)).toMatchObject({ status: 'failed', error: 'Provider connection failed before completion.' });
  });

  it('edits and reverts into isolated persistent branches without discarded future context', async () => {
    const seen: { prompt: string; messages: unknown[]; context: string; resume: string | null }[] = [];
    const { manager, dot, runs, dots, paths } = await setup(provider(async (ctx) => {
      const thread = await ctx.thread.read();
      seen.push({ prompt: ctx.prompt, messages: [...thread.messages], context: ctx.context, resume: ctx.resumeThreadId });
      await ctx.thread.write([...thread.messages, { role: 'user', content: ctx.prompt }, { role: 'assistant', content: `Answer ${ctx.prompt}` }]);
      ctx.setThreadId(`thread-${ctx.run.id}`);
      return { finalMessage: `Answer ${ctx.prompt}` };
    }));
    const finish = async (run: Run) => { await until(() => !manager.isBusy(dot.id)); return runs.get(run.id)!; };
    const first = await finish(await manager.start(dot.id, 'Earlier preference', { trigger: 'manual', newSession: true }));
    const second = await finish(await manager.start(dot.id, 'Original question', { trigger: 'manual', conversationId: first.conversationId }));
    const future = await finish(await manager.start(dot.id, 'Discarded future secret', { trigger: 'manual', conversationId: first.conversationId }));
    const edited = await finish(await manager.reviseMessage(second.id, 'Changed question'));
    expect(edited.conversationId).not.toBe(first.conversationId);
    expect(edited.prefixRunIds).toEqual([first.id]);
    expect(seen.at(-1)?.messages).toEqual([{ role: 'user', content: first.prompt }, { role: 'assistant', content: first.finalMessage }]);
    expect(seen.at(-1)?.resume).toBeNull();
    expect(seen.at(-1)?.context).not.toContain(future.prompt);
    expect(runs.get(second.id)?.prompt).toBe('Original question');
    const continuation = await finish(await manager.start(dot.id, 'Branch follow-up', { trigger: 'manual', conversationId: edited.conversationId }));
    expect(continuation.prefixRunIds).toEqual([first.id]);
    const reverted = await finish(await manager.reviseMessage(continuation.id));
    expect(reverted.prompt).toBe(continuation.prompt);
    expect(reverted.prefixRunIds).toEqual([first.id, edited.id]);
    expect(JSON.stringify(seen.at(-1)?.messages)).not.toContain('Original question');
    const fresh = await finish(await manager.reviseMessage(first.id, 'New beginning'));
    expect(seen.at(-1)?.messages).toEqual([]);
    expect(seen.at(-1)?.context).not.toContain(future.prompt);
    await expect(manager.reviseMessage(first.id, '  ')).rejects.toThrow('Enter a message');
    const reloaded = new RunStore(paths); await reloaded.init([dot.id]);
    expect(reloaded.get(reverted.id)?.prefixRunIds).toEqual([first.id, edited.id]);
    expect(reloaded.get(fresh.id)?.prompt).toBe('New beginning');
    expect((await dots.readConversation(dot.id, reverted.conversationId!)).messages.length).toBe(6);
    await dots.touch(dot.id, { providerId: 'codex' });
    await finish(await manager.reviseMessage(second.id, 'Codex branch'));
    expect(seen.at(-1)?.context).toContain('Earlier preference');
    expect(seen.at(-1)?.context).not.toContain(future.prompt);
    expect(seen.at(-1)?.resume).toBeNull();
  });

  it('rejects editing while work is active and rejects automatic messages', async () => {
    const { manager, dot } = await setup(provider(async (ctx) => {
      if (ctx.signal.aborted) throw new CancelledError();
      await new Promise<void>((_resolve, reject) => ctx.signal.addEventListener('abort', () => reject(new CancelledError()), { once: true }));
      return { finalMessage: 'Done' };
    }));
    const active = await manager.start(dot.id, 'Busy message', { trigger: 'manual' });
    await expect(manager.reviseMessage(active.id, 'Edit')).rejects.toThrow('Wait for this Dot');
    await manager.cancel(active.id);
    await until(() => !manager.isBusy(dot.id));
    const task = await manager.start(dot.id, 'Automatic message', { trigger: 'schedule' });
    await expect(manager.reviseMessage(task.id)).rejects.toThrow('Only your own messages');
  });

  it('persists multiple responsibilities and notes, retaining edits and deletes across restart', async () => {
    const { paths, dots, dot, work } = await setup();
    const research = await work.createTask(dot.id, { title: 'Market brief', prompt: 'Research the market', schedule: { kind: 'interval', everyMinutes: 30 } });
    const project = await work.createTask(dot.id, { title: 'Project partner', prompt: 'Keep the project moving' });
    await work.updateTask(research.id, { status: 'paused' });
    const preference = await dots.saveMemoryNote(dot.id, { text: 'Prefer concise reports', category: 'preference' });
    await dots.saveMemoryNote(dot.id, { id: preference.id, text: 'Prefer concise morning reports', category: 'preference' });
    await dots.appendMemory(dot.id, 'Project uses PostgreSQL');
    await dots.appendMemory(dot.id, 'Project uses PostgreSQL');
    const followup = await work.createFollowup(dot.id, { prompt: 'Check the deployment', dueAt: Date.now() + 60_000, taskId: project.id });
    const reloadedDots = new DotStore(paths); await reloadedDots.init();
    const reloadedWork = new WorkStore(paths, reloadedDots); await reloadedWork.init(() => undefined);
    expect(reloadedWork.listTasks(dot.id)).toHaveLength(2);
    expect(reloadedWork.task(research.id).status).toBe('paused');
    expect(reloadedWork.task(research.id).nextRunAt).toBeNull();
    expect(reloadedWork.followup(followup.id).conversationId).toBe(project.conversationId);
    expect(reloadedDots.listMemoryNotes(dot.id)).toHaveLength(2);
    expect(await reloadedDots.readMemory(dot.id)).toContain('[preference] Prefer concise morning reports');
    await reloadedDots.deleteMemoryNote(dot.id, preference.id);
    expect(await reloadedDots.readMemory(dot.id)).not.toContain('morning reports');
  });

  it('migrates existing markdown memories without losing user preferences', async () => {
    const { paths, dot } = await setup();
    await fs.rm(paths.memoryNotesFile(dot.id), { force: true });
    await fs.writeFile(paths.memoryFile(dot.id), '# Memory\n- Keep reports short _(2026-10-01)_\n- Project: local SQLite\n');
    const reloaded = new DotStore(paths); await reloaded.init();
    expect(reloaded.listMemoryNotes(dot.id).map((note) => note.text)).toEqual(['Keep reports short', 'Project: local SQLite']);
    await reloaded.saveMemoryNote(dot.id, { text: 'Timezone is Europe/Belgrade', category: 'preference' });
    const again = new DotStore(paths); await again.init();
    expect(again.listMemoryNotes(dot.id)).toHaveLength(3);
  });

  it('marks interrupted wakeups for review instead of replaying actions after a crash', async () => {
    const { paths, dots, dot, work } = await setup();
    const followup = await work.createFollowup(dot.id, { prompt: 'Publish the report', dueAt: Date.now() + 60_000 });
    await work.updateFollowup(followup.id, { status: 'running', runId: 'cut-off' });
    const reloaded = new WorkStore(paths, dots);
    await reloaded.init(() => ({ status: 'interrupted' } as Run));
    expect(reloaded.followup(followup.id).status).toBe('failed');
    expect(reloaded.followup(followup.id).error).toContain('Review its activity');
  });

  it('waits for a busy Dot, then fires one overdue wakeup and does not fire it twice', async () => {
    const { dots, dot, work } = await setup();
    const followup = await work.createFollowup(dot.id, { prompt: 'Check the build', dueAt: Date.now() + 1000 });
    let busy = true;
    const starts: string[] = [];
    const fakeManager = {
      isBusy: () => busy,
      start: async (_dotId: string, prompt: string) => { starts.push(prompt); busy = true; return { id: 'wake-run' }; }
    } as unknown as RunManager;
    const scheduler = new Scheduler(dots, fakeManager, () => undefined, work);
    await scheduler.tick(followup.dueAt + 60_000);
    expect(starts).toEqual([]);
    expect(work.followup(followup.id).status).toBe('pending');
    busy = false;
    await scheduler.tick(followup.dueAt + 120_000);
    busy = false;
    await scheduler.tick(followup.dueAt + 180_000);
    expect(starts).toEqual(['Check the build']);
    expect(work.followup(followup.id).runId).toBe('wake-run');
  });

  it('dispatches older pending work before a recurring task can take every free slot', async () => {
    const { dots, dot, work } = await setup();
    const task = await work.createTask(dot.id, { title: 'Fast recurring check', prompt: 'Recurring check', schedule: { kind: 'interval', everyMinutes: 1 } });
    const now = Date.now();
    await work.touchTask(task.id, { nextRunAt: now - 10_000 });
    await work.createFollowup(dot.id, { prompt: 'Important overdue wakeup', dueAt: now + 1000 });
    let busy = false;
    const starts: string[] = [];
    const fakeManager = {
      isBusy: () => busy,
      start: async (_dotId: string, prompt: string) => { starts.push(prompt); busy = true; return { id: `run-${starts.length}` }; }
    } as unknown as RunManager;
    const scheduler = new Scheduler(dots, fakeManager, () => undefined, work);
    await scheduler.tick(now + 2000);
    busy = false;
    // The recurring task is already due again, but the pending wakeup has waited longer.
    await scheduler.tick(now + 80_000);
    expect(starts).toEqual(['Recurring check', 'Important overdue wakeup']);
  });
});

describe('independent conversations and task queue', () => {
  it('serializes tasks per Dot while allowing another Dot to run, and cancels queued tasks', async () => {
    const started: string[] = [];
    const release = new Map<string, () => void>();
    const mock = provider(async (ctx) => {
      started.push(ctx.run.id);
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(new CancelledError());
        ctx.signal.addEventListener('abort', abort, { once: true });
        release.set(ctx.run.id, () => { ctx.signal.removeEventListener('abort', abort); resolve(); });
      });
      return { finalMessage: 'Done' };
    });
    const { path, dots, dot, manager, runs } = await setup(mock);
    const other = await dots.create({ ...input, name: 'Other Dot' }, join(path, 'other-workspace'));
    const first = await manager.start(dot.id, 'First task', { trigger: 'manual', newSession: true });
    const queued = await manager.start(dot.id, 'Independent second task', { trigger: 'manual', newSession: true });
    const parallel = await manager.start(other.id, 'Parallel task', { trigger: 'manual', newSession: true });
    await until(() => started.length === 2);
    expect(started).toContain(first.id); expect(started).toContain(parallel.id); expect(started).not.toContain(queued.id);
    expect(first.conversationId).not.toBe(queued.conversationId);
    await manager.cancel(queued.id);
    expect(runs.get(queued.id)?.status).toBe('cancelled');
    release.get(first.id)!(); release.get(parallel.id)!();
    await until(() => manager.activeCount() === 0);
    expect(runs.get(first.id)?.status).toBe('succeeded');
  });

  it('continues the chosen older conversation with its own history and provider session', async () => {
    const seen: { prompt: string; history: unknown[]; session: string | null }[] = [];
    const mock = provider(async (ctx: RunContext) => {
      const history = await ctx.thread.read();
      seen.push({ prompt: ctx.prompt, history: history.messages, session: ctx.resumeThreadId });
      await ctx.thread.write([...history.messages, ctx.prompt]);
      ctx.setThreadId(`provider-${ctx.run.conversationId}`);
      return { finalMessage: 'Complete' };
    });
    const { dot, manager, runs } = await setup(mock);
    const first = await manager.start(dot.id, 'Alpha', { trigger: 'manual', newSession: true });
    await until(() => runs.get(first.id)?.status === 'succeeded' && manager.activeCount() === 0);
    const second = await manager.start(dot.id, 'Beta', { trigger: 'manual', newSession: true });
    await until(() => runs.get(second.id)?.status === 'succeeded' && manager.activeCount() === 0);
    const continued = await manager.start(dot.id, 'Alpha followup', { trigger: 'manual', conversationId: first.conversationId, parentRunId: first.id });
    await until(() => runs.get(continued.id)?.status === 'succeeded' && manager.activeCount() === 0);
    expect(seen[1].history).toEqual([]);
    expect(seen[2].history).toEqual(['Alpha']);
    expect(seen[2].session).toBe(`provider-${first.conversationId}`);
    expect(continued.parentRunId).toBe(first.id);
  });

  it('gives the agent a real durable scheduling callback and saves completion state', async () => {
    const mock = provider(async (ctx) => {
      await ctx.scheduleFollowup!('Continue checking tomorrow', Date.now() + 60_000);
      return { finalMessage: 'Scheduled.' };
    });
    const { dot, manager, runs, work } = await setup(mock);
    const run = await manager.start(dot.id, 'Monitor this', { trigger: 'manual', newSession: true });
    await until(() => runs.get(run.id)?.status === 'succeeded' && manager.activeCount() === 0);
    const wakeups = work.listFollowups(dot.id);
    expect(wakeups).toHaveLength(1);
    expect(wakeups[0].conversationId).toBe(run.conversationId);
    expect(wakeups[0].status).toBe('pending');
  });

  it('removes the whole queued responsibility before aborting its active run', async () => {
    const started: string[] = [];
    const mock = provider(async (ctx) => {
      started.push(ctx.run.id);
      await new Promise<void>((_resolve, reject) => ctx.signal.addEventListener('abort', () => reject(new CancelledError()), { once: true }));
      return { finalMessage: 'Unexpected completion' };
    });
    const { dot, manager, runs, work } = await setup(mock);
    const task = await work.createTask(dot.id, { title: 'Monitor', prompt: 'Keep checking' });
    const active = await manager.start(dot.id, task.prompt, { trigger: 'manual', taskId: task.id, conversationId: task.conversationId });
    await until(() => started.length === 1);
    const queued = await manager.start(dot.id, task.prompt, { trigger: 'manual', taskId: task.id, conversationId: task.conversationId });
    await manager.cancelForTask(task.id, 'paused');
    await until(() => manager.activeCount() === 0);
    expect(started).toEqual([active.id]);
    expect(runs.get(active.id)?.status).toBe('cancelled');
    expect(runs.get(queued.id)?.status).toBe('cancelled');
  });

  it('enforces custom rules on final memory and wakeup control blocks too', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const mock = provider(async () => ({ finalMessage: `Done.\n<memory_update>Private fact</memory_update>\n<followup due="${future}">Check again</followup>` }));
    const { dots, dot, manager, runs, work } = await setup(mock);
    await dots.update(dot.id, { permissions: { ...DEFAULT_PERMISSIONS, rules: [
      { id: 'memory', action: 'remember', effect: 'deny' }, { id: 'wakeups', action: 'schedule_followup', effect: 'deny' }
    ] } });
    const run = await manager.start(dot.id, 'Work once', { trigger: 'manual', newSession: true });
    await until(() => runs.get(run.id)?.status === 'succeeded' && manager.activeCount() === 0);
    expect(dots.listMemoryNotes(dot.id)).toEqual([]);
    expect(work.listFollowups(dot.id)).toEqual([]);
    expect((await runs.events(run.id)).filter((event) => event.type === 'log' && event.level === 'warn')).toHaveLength(2);
  });
});

describe('tool permission rules and scheduling requests', () => {
  it('does not search through a symlink to a file outside the workspace', async (test) => {
    const { path, dot } = await setup();
    const external = join(path, 'outside-private.txt');
    await fs.writeFile(external, 'VERY_PRIVATE_CONTENT');
    try { await fs.symlink(external, join(dot.workspacePath, 'leak.txt'), 'file'); }
    catch (error) {
      if (['EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) test.skip();
      throw error;
    }
    const result = await searchFiles.run({ pattern: 'VERY_PRIVATE' }, { workspace: dot.workspacePath, permissions: DEFAULT_PERMISSIONS, signal: new AbortController().signal, requestApproval: async () => true, remember: async () => undefined });
    expect(result).toBe('No matches.');
  });

  it('blocks unsupported Codex UI approval policies before starting the provider', async () => {
    const codex = new CodexProvider({} as any);
    await expect(codex.run({ dot: { permissions: { ...DEFAULT_PERMISSIONS, approval: 'ask' } } } as any)).rejects.toThrow('OpenAI-compatible provider');
  });

  it('never lets an allow rule override a matching deny', async () => {
    const permissions = { ...DEFAULT_PERMISSIONS, rules: [
      { id: 'allow', action: '*', effect: 'allow' as const },
      { id: 'deny', action: 'run_command', effect: 'deny' as const, pattern: 'remove-item' }
    ] };
    expect(matchingRule(permissions, 'run_command', { command: 'Remove-Item project' })?.effect).toBe('deny');
    const tool = { name: 'run_command', category: 'shell' as const, describe: () => 'Delete a folder' } as any;
    await expect(authorizeTool(tool, { command: 'Remove-Item project' }, { permissions, requestApproval: async () => true } as any)).rejects.toThrow('Blocked');
  });

  it('requests approval before a matching action and rejects a denied decision', async () => {
    let requested = 0;
    const permissions = { ...DEFAULT_PERMISSIONS, rules: [{ id: 'ask', action: 'web_fetch', effect: 'ask' as const, pattern: 'example.com' }] };
    const tool = { name: 'web_fetch', category: 'web' as const, describe: () => 'Fetch example.com' } as any;
    await expect(authorizeTool(tool, { url: 'https://example.com' }, { permissions, requestApproval: async () => { requested++; return false; } } as any)).rejects.toThrow('declined');
    expect(requested).toBe(1);
  });

  it('matches Windows paths as literal text rather than JSON-escaped arguments', () => {
    const permissions = { ...DEFAULT_PERMISSIONS, rules: [{ id: 'private', action: 'read_file', effect: 'deny' as const, pattern: 'private\\credentials' }] };
    expect(matchingRule(permissions, 'read_file', { path: 'private\\credentials.json' })?.effect).toBe('deny');
  });

  it('validates a tool wakeup time and extracts bounded Codex wakeup blocks', async () => {
    await expect(scheduleFollowupTool.run({ prompt: 'Check later', due_at: 'not-a-date' }, { scheduleFollowup: async () => 'id' } as any)).rejects.toThrow('timezone');
    const result = extractFollowups('Done.\n<followup due="2026-12-01T09:00:00+02:00">Check release status.</followup>');
    expect(result.text).toBe('Done.');
    expect(result.followups).toEqual([{ prompt: 'Check release status.', dueAt: Date.parse('2026-12-01T09:00:00+02:00') }]);
    expect(extractFollowups('<followup due="bad">Check.</followup>').followups).toEqual([]);
  });
});
