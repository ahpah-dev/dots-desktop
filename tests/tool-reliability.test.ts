import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_BUDGET, DEFAULT_PERMISSIONS, type Dot, type RunEventBody } from '@shared/types';
import { normalizeBudget } from '@shared/budget';
import { defaultSettings } from '../src/main/storage/settingsStore';
import type { RunContext } from '../src/main/providers/types';
import { OpenAICompatibleProvider } from '../src/main/providers/openai/provider';
import { chatCompletion, type ChatMessage } from '../src/main/providers/openai/chat';
import { parseToolArguments, parseToolEnvelope, normalizeToolCalls, ToolEvidence } from '../src/main/providers/openai/toolReliability';
import { writeFile, readFile } from '../src/main/tools/files';

const cleanups: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
async function fixture(handler: (body: any, response: ServerResponse) => void) {
  const requests: any[] = [];
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); requests.push(body); handler(body, response);
  });
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  cleanups.push(() => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/v1`;
  const provider = new OpenAICompatibleProvider({ id: 'test', label: 'Small model', kind: 'openai-compatible', baseUrl, defaultModel: 'tiny-model', requiresKey: false }, async () => undefined);
  return { requests, provider, baseUrl };
}
async function context(prompt = 'Write result.txt and verify it.') {
  const workspace = await fs.mkdtemp(join(tmpdir(), 'dots-reliability-'));
  cleanups.push(() => fs.rm(workspace, { recursive: true, force: true }));
  const dot: Dot = { id: 'dot', name: 'Test', description: '', color: '#78b7a0', emoji: '', instructions: '', providerId: 'test', model: 'tiny-model', workspacePath: workspace, permissions: { ...DEFAULT_PERMISSIONS, files: 'write', shell: false, web: false, approval: 'never' }, budget: normalizeBudget({ ...DEFAULT_BUDGET, enforceLimits: false, maxSteps: 1, maxTokens: 1024, maxContextTokens: 6000 }), schedule: null, paused: false, notify: false, createdAt: 1, updatedAt: 1 };
  const events: RunEventBody[] = [];
  let stored: ChatMessage[] = [];
  const controller = new AbortController();
  const ctx: RunContext = { dot, run: { id: 'run', dotId: dot.id, trigger: 'manual', title: 'Test', prompt, status: 'running', newSession: true, createdAt: 1 }, prompt, context: 'You are a coding assistant.', newSession: true, resumeThreadId: null, signal: controller.signal, settings: defaultSettings(workspace), emit: event => events.push(event), setThreadId: () => {}, requestApproval: async () => true, remember: async () => {}, thread: { read: async () => ({ messages: stored, updatedAt: 1 }), write: async messages => { stored = messages as ChatMessage[]; } } };
  return { ctx, events, controller, stored: () => stored, workspace };
}
function reply(response: ServerResponse, message: any, reason = message.tool_calls ? 'tool_calls' : 'stop') {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ choices: [{ message, finish_reason: reason }] }));
}
const action = (name: string, args: unknown, id = 'same-router-id') => ({ content: null, tool_calls: [{ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } }] });

describe('tool argument boundaries', () => {
  it.each(['null', '[]', '5', '{"path":"x"}', '{"path":3,"content":"x"}', '{"path":"x","content":"x","append":"false"}', '{"path":"x","content":"x","contnet":"oops"}', '{"path":"x","content":"unfinished'])('rejects %s before execution', args => {
    expect(() => parseToolArguments(args, writeFile)).toThrow();
  });
  it('repairs fences, double encoding and trailing commas without changing string content', () => {
    const args = { path: 'x', content: 'keep ,} and ,] and " quotes\n🌿', append: false };
    expect(parseToolArguments(`\`\`\`json\n${JSON.stringify(args).slice(0, -1)},}\n\`\`\``, writeFile)).toEqual({ args, repaired: true });
    expect(parseToolArguments(JSON.stringify(JSON.stringify(args)), writeFile).args).toEqual(args);
    expect(parseToolArguments('{"path":"x","offset":null}', readFile).args).toEqual({ path: 'x' });
    expect(() => parseToolArguments('{"path":null}', readFile)).toThrow();
  });
  it('normalizes object arguments and missing/duplicate IDs without guessing names', () => {
    const calls = normalizeToolCalls([{ function: { name: 'write_file', arguments: { path: 'x', content: 'x' } } }, { id: 'a', function: { name: 'read_file', arguments: '{}' } }, { id: 'a', function: { name: 'read_file', arguments: '{}' } }]);
    expect(new Set(calls.map(call => call.id)).size).toBe(3);
    expect(JSON.parse(calls[0].function.arguments)).toEqual({ path: 'x', content: 'x' });
    expect(() => normalizeToolCalls([{ function: { arguments: '{}' } }])).toThrow();
  });
  it('never extracts actions from prose, fences, mixed envelopes or examples', () => {
    for (const text of ['Here is a call: {"tool_calls":[]}', '```json\n{"tool_calls":[]}\n```', '{"final":"done","tool_calls":[]}', '{"tool_calls":[]}', '{"tool_calls":[{"name":"write_file","arguments":"{}"}]}']) expect(() => parseToolEnvelope(text)).toThrow();
    expect(parseToolEnvelope('{"final":"A useful answer."}')).toEqual({ calls: [], final: 'A useful answer.' });
  });
  it.each(['How do I write a file?', 'Explain how to build an app.', 'Do not write any files.', 'Show me an example of write_file.', 'What is a function?'])('does not force side effects for %s', prompt => {
    expect(new ToolEvidence(prompt, '.').missing()).toBeUndefined();
  });
});

describe('model-independent execution recovery', () => {
  it('recovers skipped actions and skipped verification, with tools preserved and no automatic caps', async () => {
    let step = 0;
    const f = await fixture((_, response) => {
      const messages = [{ content: 'Done, I wrote it.' }, action('write_file', { path: 'result.txt', content: 'real result' }), { content: 'Verified.' }, action('read_file', { path: 'result.txt' }), { content: 'Written and checked.' }];
      reply(response, messages[step++]);
    });
    const c = await context();
    const result = await f.provider.run(c.ctx);
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('real result');
    expect(result.finalMessage).toBe('Written and checked.');
    expect(f.requests).toHaveLength(5);
    expect(f.requests[1].tool_choice).toBe('required');
    expect(f.requests[3].messages[0].content).toContain('Files changed since the last read/check');
    expect(f.requests.every(request => request.tools && !request.max_tokens)).toBe(true);
    const ids = c.stored().flatMap(message => message.tool_calls?.map(call => call.id) ?? []);
    expect(new Set(ids).size).toBe(ids.length);
    expect(c.events.some(event => event.type === 'message' && event.text === 'Done, I wrote it.')).toBe(false);
  });
  it('feeds schema failures back for correction, rather than crashing describe or asking approval', async () => {
    let step = 0, approvals = 0;
    const f = await fixture((_, response) => reply(response, [action('write_file', 'null'), action('write_file', { path: 'result.txt', content: 'fixed' }), action('read_file', { path: 'result.txt' }), { content: 'Fixed and checked.' }][step++]));
    const c = await context(); c.ctx.dot.permissions.approval = 'ask'; c.ctx.requestApproval = async () => { approvals++; return true; };
    expect((await f.provider.run(c.ctx)).finalMessage).toBe('Fixed and checked.');
    expect(approvals).toBe(1);
    expect(f.requests[1].messages.some((message: any) => message.role === 'tool' && message.content.includes('not null'))).toBe(true);
  });
  it('fails honestly when a model keeps saying done without doing anything', async () => {
    const f = await fixture((_, response) => reply(response, { content: 'Done!' }));
    const c = await context();
    await expect(f.provider.run(c.ctx)).rejects.toThrow('after recovery');
    expect(f.requests).toHaveLength(4);
    await expect(fs.stat(join(c.workspace, 'result.txt'))).rejects.toThrow();
    expect(c.events.some(event => event.type === 'message' && event.text === 'Done!')).toBe(false);
  });
  it('switches a router without native tools to JSON transport and keeps the real receipts', async () => {
    let step = 0;
    const f = await fixture((body, response) => {
      if (body.tools) { response.writeHead(400); response.end(JSON.stringify({ error: { message: 'This model does not support tool calling' } })); return; }
      const results = [{ tool_calls: [{ name: 'write_file', arguments: { path: 'result.txt', content: 'fallback works' } }] }, { tool_calls: [{ name: 'read_file', arguments: { path: 'result.txt' } }] }, { final: 'Saved and checked via JSON.' }];
      reply(response, { content: JSON.stringify(results[step++]) });
    });
    const c = await context();
    expect((await f.provider.run(c.ctx)).finalMessage).toBe('Saved and checked via JSON.');
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('fallback works');
    expect(f.requests.slice(1).every(request => !request.tools && !request.messages.some((message: any) => message.role === 'tool' || message.tool_calls))).toBe(true);
    expect(f.requests[2].messages.some((message: any) => message.content?.includes('Wrote 14 characters'))).toBe(true);
    expect(f.requests[1].messages[0].content).toContain('Available tools:');
  });
  it('falls back from unsupported required choice without disabling native tools', async () => {
    let step = 0;
    const f = await fixture((body, response) => {
      if (body.tool_choice === 'required') { response.writeHead(422); response.end(JSON.stringify({ error: { message: 'tool_choice required is not supported' } })); return; }
      reply(response, [{ content: 'Done.' }, action('write_file', { path: 'result.txt', content: 'actual' }), action('read_file', { path: 'result.txt' }), { content: 'Done and verified.' }][step++]);
    });
    expect((await f.provider.run((await context()).ctx)).finalMessage).toBe('Done and verified.');
    expect(f.requests).toHaveLength(5);
    expect(f.requests.every(request => request.tools)).toBe(true);
  });
  it('uses JSON recovery when a weak model silently ignores native tool requests', async () => {
    let step = 0;
    const f = await fixture((body, response) => {
      if (body.tools) return reply(response, { content: 'Done, everything is complete.' });
      const values = [{ tool_calls: [{ name: 'write_file', arguments: { path: 'result.txt', content: 'actually done' } }] }, { tool_calls: [{ name: 'read_file', arguments: { path: 'result.txt' } }] }, { final: 'Really saved and checked.' }];
      reply(response, { content: JSON.stringify(values[step++]) });
    });
    const c = await context();
    expect((await f.provider.run(c.ctx)).finalMessage).toBe('Really saved and checked.');
    expect(f.requests).toHaveLength(5);
    expect(f.requests[2].tools).toBeUndefined();
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('actually done');
  });
  it('does not double-append duplicate calls in one batch, even with object key order differences', async () => {
    let step = 0;
    const c = await context(); await fs.writeFile(join(c.workspace, 'result.txt'), 'start');
    const f = await fixture((_, response) => {
      const messages = [action('write_file', { path: 'result.txt', content: '+tail', append: true }), action('read_file', { path: 'result.txt' }), { content: 'Appended and checked.' }];
      const message = messages[step++];
      if (step === 1 && 'tool_calls' in message) message.tool_calls.push({ id: 'duplicate', type: 'function', function: { name: 'write_file', arguments: '{"append":true,"content":"+tail","path":"result.txt"}' } });
      reply(response, message);
    });
    await f.provider.run(c.ctx);
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('start+tail');
    expect(c.events.filter(event => event.type === 'file')).toHaveLength(1);
  });
  it('does not repeat a successful append when a recovery attempt replays it', async () => {
    let step = 0;
    const append = action('write_file', { path: 'result.txt', content: 'once', append: true });
    const f = await fixture((_, response) => reply(response, [append, { content: 'Done.' }, append, action('read_file', { path: 'result.txt' }), { content: 'Checked.' }][step++]));
    const c = await context(); await f.provider.run(c.ctx);
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('once');
  });
  it('preserves explicit denials and never prompts twice for a replayed call', async () => {
    let step = 0, approvals = 0;
    const write = action('write_file', { path: 'result.txt', content: 'denied' });
    const f = await fixture((_, response) => reply(response, [write, write, { content: 'Cannot save it without your approval.' }][step++]));
    const c = await context(); c.ctx.dot.permissions.approval = 'ask'; c.ctx.requestApproval = async () => { approvals++; return false; };
    const result = await f.provider.run(c.ctx);
    expect(approvals).toBe(1);
    expect(f.requests[1].tool_choice).toBe('auto');
    expect(result.finalMessage).toContain('The user declined');
    await expect(fs.stat(join(c.workspace, 'result.txt'))).rejects.toThrow();
  });
  it('never executes valid-looking tool arguments when the finish reason is length', async () => {
    let step = 0;
    const f = await fixture((_, response) => { reply(response, [action('write_file', { path: 'result.txt', content: 'partial', append: true }), action('write_file', { path: 'result.txt', content: 'whole' }), action('read_file', { path: 'result.txt' }), { content: 'Complete.' }][step], step++ === 0 ? 'length' : undefined); });
    const c = await context(); await f.provider.run(c.ctx);
    expect(c.events.filter(event => event.type === 'file')).toHaveLength(1);
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('whole');
  });
  it('keeps complete displayed answers with length finish reasons and no actions successful', async () => {
    const f = await fixture((_, response) => reply(response, { content: 'The answer is four.' }, 'length'));
    expect((await f.provider.run((await context('What is 2 + 2?')).ctx)).finalMessage).toBe('The answer is four.');
    expect(f.requests).toHaveLength(1);
  });
  it('does not execute tool JSON quoted in a normal question', async () => {
    const example = JSON.stringify({ tool_calls: [{ name: 'write_file', arguments: { path: 'example.txt', content: 'never execute' } }] });
    const f = await fixture((_, response) => reply(response, { content: example }));
    const c = await context('Explain the JSON format for a tool call.');
    expect((await f.provider.run(c.ctx)).finalMessage).toBe(example);
    expect(c.events.filter(event => event.type === 'tool')).toHaveLength(0);
  });
  it('cancels a recovery request promptly', async () => {
    const c = await context();
    const f = await fixture((_, response) => { reply(response, { content: 'Done.' }); c.controller.abort(); });
    await expect(f.provider.run(c.ctx)).rejects.toThrow('Cancelled');
    await expect(fs.stat(join(c.workspace, 'result.txt'))).rejects.toThrow();
  });
  it('keeps genuine execution failures available for repair past the protocol recovery count', async () => {
    let step = 0;
    const command = process.platform === 'win32' ? "if (!(Test-Path -LiteralPath 'result.txt')) { throw 'Need the real file' }; Get-Content -LiteralPath 'result.txt'" : 'cat result.txt';
    const f = await fixture((_, response) => {
      const index = step++;
      reply(response, index < 4 || index === 5 ? action('run_command', { command }) : index === 4 ? action('write_file', { path: 'result.txt', content: 'repaired' }) : { content: 'Repaired and checked.' });
    });
    const c = await context('Run the tests and write result.txt.'); c.ctx.dot.permissions.shell = true;
    expect((await f.provider.run(c.ctx)).finalMessage).toBe('Repaired and checked.');
    expect(f.requests).toHaveLength(7);
    expect(c.events.filter(event => event.type === 'tool' && event.status === 'error')).toHaveLength(4);
  });
  it('keeps custom denials effective in JSON fallback', async () => {
    let step = 0;
    const f = await fixture((body, response) => {
      if (body.tools) { response.writeHead(400); response.end(JSON.stringify({ error: { message: 'tools are not supported' } })); return; }
      reply(response, { content: JSON.stringify(step++ ? { final: 'The write was blocked.' } : { tool_calls: [{ name: 'write_file', arguments: { path: 'result.txt', content: 'blocked' } }] }) });
    });
    const c = await context(); c.ctx.dot.permissions.rules = [{ id: 'deny', action: 'write_file', effect: 'deny', pattern: 'result.txt' }];
    let approvals = 0; c.ctx.requestApproval = async () => { approvals++; return true; };
    expect((await f.provider.run(c.ctx)).finalMessage).toContain('Blocked by the custom permission rule');
    expect(approvals).toBe(0);
    await expect(fs.stat(join(c.workspace, 'result.txt'))).rejects.toThrow();
  });
  it('preserves workspace boundaries during corrective calls', async () => {
    let step = 0;
    const f = await fixture((_, response) => reply(response, [action('write_file', { path: '../escape.txt', content: 'blocked' }), { content: 'Cannot write outside the workspace.' }][step++]));
    const c = await context();
    expect((await f.provider.run(c.ctx)).finalMessage).toContain('outside this Dot');
    expect(c.events.filter(event => event.type === 'file')).toHaveLength(0);
  });
  it('does not reset missed-action recovery merely because a model keeps listing files', async () => {
    let step = 0;
    const f = await fixture((_, response) => reply(response, step++ % 2 ? action('list_files', {}) : { content: 'Done.' }));
    const c = await context();
    await expect(f.provider.run(c.ctx)).rejects.toThrow('after recovery');
    expect(f.requests.length).toBeLessThan(10);
    await expect(fs.stat(join(c.workspace, 'result.txt'))).rejects.toThrow();
  });
  it('uses an explicitly configured fallback after repeated missed actions', async () => {
    let backupStep = 0;
    const f = await fixture((body, response) => reply(response, body.model === 'tiny-model' ? { content: 'Done!' } : [action('write_file', { path: 'result.txt', content: 'backup completed it' }), action('read_file', { path: 'result.txt' }), { content: 'The fallback saved and checked it.' }][backupStep++]));
    const fallback = new OpenAICompatibleProvider({ id: 'test', label: 'Small model', kind: 'openai-compatible', baseUrl: f.baseUrl, defaultModel: 'tiny-model', requiresKey: false, fallbackModels: ['backup'] }, async () => undefined);
    const c = await context();
    expect((await fallback.run(c.ctx)).finalMessage).toBe('The fallback saved and checked it.');
    expect(f.requests.map(request => request.model)).toEqual(['tiny-model', 'tiny-model', 'tiny-model', 'tiny-model', 'backup', 'backup', 'backup']);
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('backup completed it');
  });
  it('accepts complete JSON final answers with length finish reasons in fallback mode', async () => {
    const f = await fixture((body, response) => {
      if (body.tools) { response.writeHead(400); response.end(JSON.stringify({ error: { message: 'tools not supported' } })); return; }
      reply(response, { content: '{"final":"4"}' }, 'length');
    });
    expect((await f.provider.run((await context('What is 2 + 2?')).ctx)).finalMessage).toBe('4');
  });
  it('accepts a validated native call returned by a router while using JSON fallback', async () => {
    let step = 0;
    const f = await fixture((body, response) => {
      if (body.tools) { response.writeHead(400); response.end(JSON.stringify({ error: { message: 'tools not supported' } })); return; }
      reply(response, [action('write_file', { path: 'result.txt', content: 'mixed transport' }), action('read_file', { path: 'result.txt' }), { content: '{"final":"Mixed response checked."}' }][step++]);
    });
    const c = await context();
    expect((await f.provider.run(c.ctx)).finalMessage).toBe('Mixed response checked.');
    expect(await fs.readFile(join(c.workspace, 'result.txt'), 'utf8')).toBe('mixed transport');
  });
});

describe('router stream integrity', () => {
  const sse = (response: ServerResponse, chunks: unknown[], done = true) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    response.end(done ? 'data: [DONE]\n\n' : '');
  };
  it('handles legacy calls, repeated names and accumulated argument snapshots', async () => {
    const f = await fixture((_, response) => sse(response, [
      { choices: [{ delta: { function_call: { name: 'write_file', arguments: '{"path":"x",' } } }] },
      { choices: [{ delta: { function_call: { name: 'write_file', arguments: '{"path":"x","content":"🌿 repeated repeated"}' } }, finish_reason: 'function_call' }] },
    ]));
    const result = await chatCompletion({ baseUrl: f.baseUrl, apiKey: '', body: {}, signal: new AbortController().signal });
    expect(result.toolCalls[0].function).toEqual({ name: 'write_file', arguments: '{"path":"x","content":"🌿 repeated repeated"}' });
  });
  it('refuses an abruptly terminated stream before executing tools', async () => {
    const f = await fixture((_, response) => sse(response, [{ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'write_file', arguments: '{"path":"x","content":"complete but unfinished turn"}' } }] } }] }], false));
    await expect(chatCompletion({ baseUrl: f.baseUrl, apiKey: '', body: {}, signal: new AbortController().signal })).rejects.toThrow('stream ended');
  });
  it('does not silently drop malformed stream fragments', async () => {
    const f = await fixture((_, response) => { response.writeHead(200, { 'content-type': 'text/event-stream' }); response.end('data: {broken}\n\ndata: [DONE]\n\n'); });
    await expect(chatCompletion({ baseUrl: f.baseUrl, apiKey: '', body: {}, signal: new AbortController().signal })).rejects.toThrow('invalid stream fragment');
  });
});
