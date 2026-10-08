import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_PERMISSIONS, type Dot } from '@shared/types';
import { Paths } from '../src/main/util/paths';
import { DotStore } from '../src/main/storage/dotStore';
import { RunStore } from '../src/main/storage/runStore';
import { SettingsStore, defaultSettings } from '../src/main/storage/settingsStore';
import { RunManager } from '../src/main/engine/runManager';
import { ApprovalGate } from '../src/main/engine/approvals';
import { extractDotMessages } from '../src/main/engine/context';
import { toolsFor } from '../src/main/tools/registry';
import type { ProviderRegistry } from '../src/main/providers/registry';
import { CancelledError, type AgentProvider, type RunContext } from '../src/main/providers/types';

const fixtures: { path: string; manager: RunManager }[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) {
    await fixture.manager.shutdown();
    await fs.rm(fixture.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function setup(run: AgentProvider['run']) {
  const path = await fs.mkdtemp(join(tmpdir(), 'dots-messaging-'));
  const paths = new Paths(join(path, 'data'));
  const dots = new DotStore(paths); await dots.init();
  const create = (name: string, enabled = true) => dots.create({ name, description: `${name} expertise`, color: '#78b7a0', emoji: '🌱', instructions: 'Keep your own permissions.', providerId: 'mock', model: 'auto', permissions: { ...DEFAULT_PERMISSIONS, talkToDots: enabled }, notify: false }, join(path, name));
  const a = await create('Writer'), b = await create('Researcher');
  const runs = new RunStore(paths); await runs.init([a.id, b.id]);
  const settings = new SettingsStore(paths.settings, defaultSettings(join(path, 'workspaces'))); await settings.init();
  await settings.update({ maxConcurrentRuns: 1 });
  const provider: AgentProvider = { id: 'mock', label: 'Mock', run, listModels: async () => [], test: async () => ({ ok: true, message: '' }) };
  const approvals = new ApprovalGate();
  const manager = new RunManager(dots, runs, { get: () => provider } as unknown as ProviderRegistry, settings, approvals);
  fixtures.push({ path, manager });
  return { manager, runs, dots, a, b, create, paths, approvals };
}

async function until(predicate: () => boolean) {
  const deadline = Date.now() + 5000;
  while (!predicate()) { if (Date.now() > deadline) throw new Error('Engine did not finish'); await new Promise(r => setTimeout(r, 5)); }
}

describe('Dot teammate messages', () => {
  it('delivers and replies in the original conversation with one execution slot and persists provenance', async () => {
    let target: Dot;
    const seen: RunContext[] = [];
    const f = await setup(async ctx => {
      seen.push(ctx);
      const thread = await ctx.thread.read();
      await ctx.thread.write([...thread.messages, { role: 'user', content: ctx.prompt }]);
      if (!ctx.run.dotMessage) {
        const teammates = await ctx.listTeammates!();
        expect(teammates.map(t => t.id)).toEqual([target.id]);
        expect(JSON.stringify(teammates)).not.toContain('Keep your own permissions');
        expect(await ctx.sendDotMessage!(target.id, 'Find the key facts.')).toContain('Message queued');
        return { finalMessage: 'I asked Researcher for the facts.' };
      }
      if (ctx.run.dotMessage.kind === 'request') {
        expect(ctx.dot.id).toBe(target.id);
        expect(ctx.context).toContain('automatically');
        expect(ctx.newSession).toBe(true);
        return { finalMessage: 'The key fact is 42.' };
      }
      expect(ctx.prompt).toBe('The key fact is 42.');
      expect(thread.messages).toEqual([{ role: 'user', content: 'Prepare a brief.' }]);
      return { finalMessage: 'Brief completed with the teammate’s facts.' };
    }); target = f.b;
    const root = await f.manager.start(f.a.id, 'Prepare a brief.', { trigger: 'manual' });
    await until(() => seen.length === 3 && f.manager.activeCount() === 0);
    const request = f.runs.listForDot(f.b.id)[0], reply = f.runs.listForDot(f.a.id).find(r => r.dotMessage?.kind === 'reply')!;
    expect(request.dotMessage?.sourceRunId).toBe(root.id);
    expect(reply.conversationId).toBe(root.conversationId);
    expect(reply.status).toBe('succeeded');
    const reloaded = new RunStore(f.paths); await reloaded.init([f.a.id, f.b.id]);
    expect(reloaded.get(reply.id)?.dotMessage).toEqual(reply.dotMessage);
  });

  it('honors disabled messaging and rejects self, paused and oversized requests', async () => {
    let f: Awaited<ReturnType<typeof setup>>;
    f = await setup(async ctx => {
      await expect(ctx.sendDotMessage!(ctx.dot.id, 'hello')).rejects.toThrow('another Dot');
      await f.dots.touch(f.b.id, { permissions: { ...f.b.permissions, talkToDots: false } });
      await expect(ctx.sendDotMessage!(f.b.id, 'hello')).rejects.toThrow('Both Dots');
      await f.dots.touch(f.b.id, { permissions: f.b.permissions, paused: true });
      await expect(ctx.sendDotMessage!(f.b.id, 'hello')).rejects.toThrow('paused');
      await f.dots.touch(f.b.id, { paused: false });
      await expect(ctx.sendDotMessage!(f.b.id, 'x'.repeat(8001))).rejects.toThrow('8,000');
      await expect(ctx.sendDotMessage!(f.b.id, '  ')).rejects.toThrow('8,000');
      await expect(ctx.sendDotMessage!('missing-dot', 'hello')).rejects.toThrow();
      return { finalMessage: 'Invalid messages rejected.' };
    });
    const root = await f.manager.start(f.a.id, 'Validate messaging', { trigger: 'manual' });
    await until(() => f.manager.activeCount() === 0);
    expect(f.runs.get(root.id)?.status).toBe('succeeded');
    expect(f.runs.listForDot(f.b.id)).toHaveLength(0);
    expect(toolsFor({ ...DEFAULT_PERMISSIONS, talkToDots: false }).map(t => t.name)).not.toContain('send_dot_message');
    expect(toolsFor(DEFAULT_PERMISSIONS).map(t => t.name)).toContain('send_dot_message');
  });

  it('bounds a provider that tries to create endless exchanges', async () => {
    let f: Awaited<ReturnType<typeof setup>>;
    const limits: string[] = [];
    f = await setup(async ctx => {
      const target = ctx.dot.id === f.a.id ? f.b.id : f.a.id;
      for (let i = 0; i < 4; i++) {
        try { await ctx.sendDotMessage!(target, 'Continue the exchange.'); }
        catch (e) { limits.push(String(e)); }
      }
      return { finalMessage: 'Done.' };
    });
    await f.manager.start(f.a.id, 'Try repeated messages', { trigger: 'manual' });
    await until(() => f.manager.activeCount() === 0);
    const messages = [f.a, f.b].flatMap(dot => f.runs.listForDot(dot.id)).filter(r => r.dotMessage);
    expect(messages.filter(r => r.dotMessage?.kind === 'request').length).toBeLessThanOrEqual(8);
    expect(Math.max(...messages.map(r => r.dotMessage!.depth))).toBeLessThanOrEqual(4);
    expect(messages.length).toBeLessThanOrEqual(16);
    expect(limits.some(text => text.includes('limit'))).toBe(true);
  });

  it('rechecks messaging permissions before queued delivery instead of invoking a revoked recipient', async () => {
    let f: Awaited<ReturnType<typeof setup>>;
    let recipientInvoked = false;
    f = await setup(async ctx => {
      if (ctx.dot.id === f.b.id) { recipientInvoked = true; return { finalMessage: 'Should not run.' }; }
      await ctx.sendDotMessage!(f.b.id, 'A queued request.');
      await f.dots.touch(f.b.id, { permissions: { ...f.b.permissions, talkToDots: false } });
      return { finalMessage: 'Request queued before permission changed.' };
    });
    await f.manager.start(f.a.id, 'Check revocation', { trigger: 'manual' });
    await until(() => f.manager.activeCount() === 0);
    expect(recipientInvoked).toBe(false);
    expect(f.runs.listForDot(f.b.id)[0].error).toContain('disabled');
    expect(f.runs.listForDot(f.a.id)).toHaveLength(1);
  });

  it('honors human review for a Codex-format message request before delivering it', async () => {
    let target: Dot;
    const f = await setup(async () => ({ finalMessage: `<dot_message>${JSON.stringify({ dot_id: target.id, message: 'Review this request.' })}</dot_message>` })); target = f.b;
    await f.dots.touch(f.a.id, { permissions: { ...f.a.permissions, rules: [{ id: 'review', action: 'send_dot_message', effect: 'ask' }] } });
    let reviews = 0;
    f.approvals.requested.on(request => { reviews++; expect(f.runs.listForDot(f.b.id)).toHaveLength(0); f.approvals.resolve(request.id, false); });
    const root = await f.manager.start(f.a.id, 'Request with review', { trigger: 'manual' });
    await until(() => f.manager.activeCount() === 0);
    expect(reviews).toBe(1);
    expect(f.runs.listForDot(f.b.id)).toHaveLength(0);
    expect((await f.runs.events(root.id)).some(event => event.type === 'tool' && event.output?.includes('declined'))).toBe(true);
  });

  it('cancels queued child messages with their origin and does not deliver replies', async () => {
    let target: Dot;
    let sent = false;
    const f = await setup(async ctx => {
      await ctx.sendDotMessage!(target.id, 'A queued request.'); sent = true;
      await new Promise<void>((_resolve, reject) => ctx.signal.addEventListener('abort', () => reject(new CancelledError()), { once: true }));
      return { finalMessage: 'Unreachable' };
    }); target = f.b;
    const root = await f.manager.start(f.a.id, 'Cancel this exchange', { trigger: 'manual' });
    await until(() => sent);
    await f.manager.cancel(root.id);
    await until(() => f.manager.activeCount() === 0);
    expect(f.runs.get(root.id)?.status).toBe('cancelled');
    expect(f.runs.listForDot(f.b.id)[0].status).toBe('cancelled');
    expect(f.runs.listForDot(f.a.id)).toHaveLength(1);
  });

  it('returns a failed teammate request as a reply so the sender can report the problem', async () => {
    let target: Dot;
    const f = await setup(async ctx => {
      if (ctx.run.dotMessage?.kind === 'request') throw new Error('Research service unavailable.');
      if (ctx.run.dotMessage?.kind === 'reply') return { finalMessage: ctx.prompt };
      await ctx.sendDotMessage!(target.id, 'Research this');
      return { finalMessage: 'Requested research.' };
    }); target = f.b;
    await f.manager.start(f.a.id, 'Research brief', { trigger: 'manual' });
    await until(() => f.manager.activeCount() === 0);
    expect(f.runs.listForDot(f.a.id).find(r => r.dotMessage?.kind === 'reply')?.finalMessage).toContain('Research service unavailable');
  });

  it('supports Codex final message blocks through the same validated delivery path', async () => {
    let target: Dot;
    const f = await setup(async ctx => ctx.run.dotMessage ? { finalMessage: 'Teammate answer.' } : { finalMessage: `Requested research.\n<dot_message>${JSON.stringify({ dot_id: target.id, message: 'Check these facts.' })}</dot_message>` }); target = f.b;
    const root = await f.manager.start(f.a.id, 'Use a final block', { trigger: 'manual' });
    await until(() => f.manager.activeCount() === 0);
    expect(f.runs.get(root.id)?.finalMessage).toBe('Requested research.');
    expect(f.runs.listForDot(f.b.id)[0].prompt).toBe('Check these facts.');
    expect((await f.runs.events(root.id)).some(e => e.type === 'tool' && e.name === 'send_dot_message' && e.status === 'ok')).toBe(true);
  });

  it('blocks final-block delivery when the sender disabled messages or a custom rule denies it', async () => {
    let target: Dot;
    const f = await setup(async () => ({ finalMessage: `<dot_message>${JSON.stringify({ dot_id: target.id, message: 'Check facts.' })}</dot_message>` })); target = f.b;
    for (const permissions of [{ ...f.a.permissions, talkToDots: false }, { ...f.a.permissions, rules: [{ id: 'deny', action: 'send_dot_message', effect: 'deny' as const }] }]) {
      await f.dots.touch(f.a.id, { permissions });
      const root = await f.manager.start(f.a.id, 'Denied message', { trigger: 'manual' });
      await until(() => f.manager.activeCount() === 0);
      expect((await f.runs.events(root.id)).some(e => e.type === 'tool' && e.status === 'error')).toBe(true);
    }
    expect(f.runs.listForDot(f.b.id)).toHaveLength(0);
  });

  it('keeps malformed or excess final blocks visible instead of silently executing them', () => {
    expect(extractDotMessages('<dot_message>invalid</dot_message>').messages).toEqual([]);
    expect(extractDotMessages('<dot_message>{"dot_id":"id","message":""}</dot_message>').messages).toEqual([]);
    const block = '<dot_message>{"dot_id":"id","message":"hello"}</dot_message>';
    const result = extractDotMessages(block.repeat(4));
    expect(result.messages).toHaveLength(3);
    expect(result.text).toBe(block);
  });
});
