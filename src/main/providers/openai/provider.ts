import type { ModelInfo, ProviderProfile, Usage } from '@shared/types';
import { mergeModelsWithCatalog } from '@shared/models';
import { CancelledError, ProviderError, type AgentProvider, type ProviderResult, type RunContext } from '../types';
import { chatCompletion, listModelIds, type ChatMessage } from './chat';
import { toolsFor } from '../../tools/registry';
import type { ToolContext } from '../../tools/types';
import { authorizeTool } from '../../tools/permissions';
import { clip, errorMessage } from '../../util/misc';

const HISTORY_USER_TURNS = 8;
const HISTORY_MAX_CHARS = 160_000;
const STORED_TOOL_OUTPUT = 4000;

export interface KeyResolver {
  (profileId: string): Promise<string | undefined>;
}

/** Agent loop for any OpenAI-compatible Chat Completions endpoint with function calling. */
export class OpenAICompatibleProvider implements AgentProvider {
  readonly id: string;
  readonly label: string;

  constructor(private profile: Omit<ProviderProfile, 'hasKey'>, private getKey: KeyResolver) {
    this.id = profile.id;
    this.label = profile.label;
  }

  private async key(): Promise<string> {
    const k = await this.getKey(this.profile.id);
    if (!k) throw new ProviderError(`No API key is saved for "${this.label}". Add one in Settings → Accounts.`);
    return k;
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const ids = await listModelIds(this.profile.baseUrl, await this.key(), AbortSignal.timeout(25_000));
      const list = ids.map((id) => ({ id, label: id, isDefault: id === this.profile.defaultModel }));
      return mergeModelsWithCatalog(list);
    } catch {
      return mergeModelsWithCatalog([{ id: this.profile.defaultModel, label: this.profile.defaultModel, isDefault: true }]);
    }
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    try {
      const ids = await listModelIds(this.profile.baseUrl, await this.key(), AbortSignal.timeout(25_000));
      return { ok: true, message: `Connected. ${ids.length} models available.` };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }

  async run(ctx: RunContext): Promise<ProviderResult> {
    const apiKey = await this.key();
    const model = ctx.dot.model && ctx.dot.model !== 'auto' ? ctx.dot.model : this.profile.defaultModel;
    const tools = toolsFor(ctx.dot.permissions);
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    const toolDefs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const isOpenAI = new URL(this.profile.baseUrl).hostname === 'api.openai.com';

    const history = ctx.newSession ? [] : ((await ctx.thread.read()).messages as ChatMessage[]);
    const persisted: ChatMessage[] = [...history, { role: 'user', content: ctx.prompt }];
    const system: ChatMessage = { role: 'system', content: `${ctx.context}\n\n${TOOL_GUIDE}` };
    await ctx.thread.write(persisted);

    const toolCtx: ToolContext = {
      workspace: ctx.dot.workspacePath,
      permissions: ctx.dot.permissions,
      signal: ctx.signal,
      requestApproval: ctx.requestApproval,
      remember: ctx.remember,
      scheduleFollowup: ctx.scheduleFollowup
    };

    const total: Usage = { inputTokens: 0, outputTokens: 0 };
    let finalMessage = '';
    const maxSteps = ctx.dot.budget.maxSteps;

    for (let step = 1; step <= maxSteps + 1; step++) {
      if (ctx.signal.aborted) throw new CancelledError();
      const lastStep = step > maxSteps;
      const draftId = `draft-${step}`;
      let lastDraft = 0;

      const result = await chatCompletion({
        baseUrl: this.profile.baseUrl,
        apiKey,
        signal: ctx.signal,
        onText: (text) => {
          const now = Date.now();
          if (now - lastDraft > 120) {
            lastDraft = now;
            ctx.emit({ type: 'draft', id: draftId, text });
          }
        },
        body: {
          model,
          messages: [system, ...persisted],
          ...(toolDefs.length && !lastStep ? { tools: toolDefs, tool_choice: 'auto' } : {}),
          ...(isOpenAI && ctx.dot.reasoningEffort ? { reasoning_effort: ctx.dot.reasoningEffort } : {}),
          ...(isOpenAI ? { stream_options: { include_usage: true } } : {})
        }
      });

      if (result.usage) {
        total.inputTokens += result.usage.inputTokens;
        total.outputTokens += result.usage.outputTokens;
      }

      const assistant: ChatMessage = { role: 'assistant', content: result.content || null };
      if (result.toolCalls.length && !lastStep) assistant.tool_calls = result.toolCalls;
      if (result.content) ctx.emit({ type: 'message', id: draftId, text: result.content });

      if (!assistant.tool_calls) {
        finalMessage = result.content;
        persisted.push(assistant);
        if (lastStep) ctx.emit({ type: 'log', level: 'warn', text: `Stopped after reaching the step limit (${maxSteps}).` });
        break;
      }

      // Run every requested tool, then commit the assistant turn + tool results together so the
      // stored conversation is always structurally valid (even after a cancel).
      const toolMessages: ChatMessage[] = [];
      for (const call of assistant.tool_calls) {
        if (ctx.signal.aborted) throw new CancelledError();
        toolMessages.push({ role: 'tool', tool_call_id: call.id, content: await this.runTool(call, toolMap, toolCtx, ctx) });
      }
      persisted.push(assistant, ...toolMessages);
      await ctx.thread.write(trimHistory(persisted));
    }

    await ctx.thread.write(trimHistory(persisted));
    if (total.inputTokens || total.outputTokens) ctx.emit({ type: 'usage', usage: total });
    return { finalMessage, usage: total.inputTokens || total.outputTokens ? total : undefined };
  }

  private async runTool(
    call: { id: string; function: { name: string; arguments: string } },
    toolMap: Map<string, ReturnType<typeof toolsFor>[number]>,
    toolCtx: ToolContext,
    ctx: RunContext
  ): Promise<string> {
    const tool = toolMap.get(call.function.name);
    let args: Record<string, any> = {};
    try {
      args = call.function.arguments?.trim() ? JSON.parse(call.function.arguments) : {};
    } catch {
      const msg = 'Error: the tool arguments were not valid JSON.';
      ctx.emit({ type: 'tool', id: call.id, category: 'other', name: call.function.name, status: 'error', output: msg });
      return msg;
    }
    if (!tool) {
      const msg = `Error: unknown tool "${call.function.name}". Available: ${[...toolMap.keys()].join(', ')}.`;
      ctx.emit({ type: 'tool', id: call.id, category: 'other', name: call.function.name, status: 'error', output: msg });
      return msg;
    }
    const input = tool.describe(args);
    ctx.emit({ type: 'tool', id: call.id, category: tool.category, name: tool.name, input, status: 'running' });
    try {
      const authorized = await authorizeTool(tool, args, toolCtx);
      const out = await tool.run(args, authorized);
      ctx.emit({ type: 'tool', id: call.id, category: tool.category, name: tool.name, input, output: clip(out, 6000), status: 'ok' });
      if (tool.name === 'write_file' || tool.name === 'edit_file') {
        ctx.emit({ type: 'file', path: String(args.path), change: tool.name === 'write_file' ? 'add' : 'update' });
      }
      return clip(out, STORED_TOOL_OUTPUT);
    } catch (err) {
      if (ctx.signal.aborted) throw new CancelledError();
      const msg = `Error: ${errorMessage(err)}`;
      ctx.emit({ type: 'tool', id: call.id, category: tool.category, name: tool.name, input, output: msg, status: 'error' });
      return clip(msg, STORED_TOOL_OUTPUT);
    }
  }
}

const TOOL_GUIDE = `## Working style
- You can call tools to inspect and change your workspace, run commands, browse the web and save memory.
- Work autonomously: plan briefly, use tools, verify your work, then give a concise final summary of what you did and found.
- If a tool returns an error, read it and adapt instead of repeating the same call.
- Be economical: don't read huge files fully when searching will do.`;

/** Keep the most recent turns, never splitting an assistant tool-call from its tool results. */
export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
  const userIdx: number[] = [];
  messages.forEach((m, i) => { if (m.role === 'user') userIdx.push(i); });
  let start = userIdx.length > HISTORY_USER_TURNS ? userIdx[userIdx.length - HISTORY_USER_TURNS] : 0;
  const size = (from: number) => messages.slice(from).reduce((n, m) => n + (m.content?.length ?? 0) + JSON.stringify(m.tool_calls ?? '').length, 0);
  while (size(start) > HISTORY_MAX_CHARS) {
    const next = userIdx.find((i) => i > start);
    if (next === undefined) break;
    start = next;
  }
  return messages.slice(start);
}
