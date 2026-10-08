import type { ModelInfo, ProviderProfile, Usage } from '@shared/types';
import { normalizeBudget, estimateTokens } from '@shared/budget';
import { CancelledError, ProviderError, type AgentProvider, type ProviderResult, type RunContext } from '../types';
import { chatCompletion, listModelDetails, type ChatMessage } from './chat';
import { compactMessages, compactAdaptiveMessages } from './efficiency';
import { toolsFor } from '../../tools/registry';
import type { ToolContext } from '../../tools/types';
import { authorizeTool } from '../../tools/permissions';
import { clip, errorMessage } from '../../util/misc';
import { buildWorkInstructions, buildWorkProgress } from '../../engine/workStyle';

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
    if (!k && this.profile.requiresKey !== false) throw new ProviderError(`No API key is saved for "${this.label}". Add one in Settings → Model providers.`);
    return k || '';
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const models = await listModelDetails(this.profile.baseUrl, await this.key(), AbortSignal.timeout(25_000));
      return models.map(model => ({ ...model, isDefault: model.id === this.profile.defaultModel }));
    } catch {
      return [{ id: this.profile.defaultModel, label: this.profile.defaultModel, isDefault: true }];
    }
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    try {
      const models = await listModelDetails(this.profile.baseUrl, await this.key(), AbortSignal.timeout(25_000));
      return { ok: models.length > 0, message: models.length ? `Connected. ${models.length} models available.${models.some(model => model.id === this.profile.defaultModel) ? '' : ' The default model was not listed; discover models to choose an available one.'}` : 'Connected, but no models are available. Load or enable a model first.' };
    } catch (err) {
      return { ok: false, message: errorMessage(err) };
    }
  }

  async run(ctx: RunContext): Promise<ProviderResult> {
    const apiKey = await this.key();
    let model = ctx.dot.model && ctx.dot.model !== 'auto' ? ctx.dot.model : this.profile.defaultModel;
    const fallbackModels = [...(this.profile.fallbackModels || [])].filter(fallback => fallback !== model);
    const budget = normalizeBudget(ctx.dot.budget);
    const tools = ctx.run.team?.role === 'synthesis' ? [] : toolsFor(ctx.dot.permissions).filter(tool => !ctx.run.team || !['list_dots', 'send_dot_message', 'schedule_followup'].includes(tool.name));
    const toolMap = new Map(tools.map((t) => [t.name, t]));
    const toolDefs = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const isOpenAI = new URL(this.profile.baseUrl).hostname === 'api.openai.com';
    const usageSupported = isOpenAI || ['openrouter.ai', 'api.groq.com', 'integrate.api.nvidia.com'].includes(new URL(this.profile.baseUrl).hostname);

    const history = ctx.newSession ? [] : ((await ctx.thread.read()).messages as ChatMessage[]);
    const persisted: ChatMessage[] = [...history, { role: 'user', content: ctx.prompt }];
    const instructions = `${ctx.context}\n\n${TOOL_GUIDE}\n\n${buildWorkInstructions(budget)}`;
    await ctx.thread.write(persisted);

    const toolCtx: ToolContext = {
      workspace: ctx.dot.workspacePath,
      permissions: ctx.dot.permissions,
      signal: ctx.signal,
      requestApproval: ctx.requestApproval,
      remember: ctx.remember,
      scheduleFollowup: ctx.scheduleFollowup,
      listTeammates: ctx.listTeammates,
      sendDotMessage: ctx.sendDotMessage
    };

    const total: Usage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
    let finalMessage = '';
    const strict = budget.enforceLimits === true;
    // Automatic runs remain cancellable and time-bounded; this guards pathological loops.
    const maxSteps = strict ? budget.maxSteps : 500;

    for (let step = 1; step <= maxSteps + 1; step++) {
      if (ctx.signal.aborted) throw new CancelledError();
      const remaining = strict ? budget.maxTokens! - total.inputTokens - total.outputTokens : Infinity;
      const maxOutput = strict ? Math.min(budget.maxOutputTokens!, Math.floor(remaining / 3)) : undefined;
      if (strict && maxOutput! < 128) throw new ProviderError('Stopped at the token budget. Review the completed activity or continue with a larger budget.');
      // Reserve room to report progress before a normal tool request uses the last allowance.
      const requestEstimate = estimateTokens(JSON.stringify([{ role: 'system', content: instructions }, ...persisted])) + estimateTokens(JSON.stringify(toolDefs));
      const lastStep = step > maxSteps || (strict && step > 1 && remaining < Math.min(budget.maxContextTokens!, requestEstimate) + maxOutput! * 2);
      const system: ChatMessage = { role: 'system', content: `${instructions}\n\n${buildWorkProgress(budget, step, remaining, lastStep)}` };
      const extraTokens = toolDefs.length && !lastStep ? estimateTokens(JSON.stringify(toolDefs)) : 0;
      const compact = strict
        ? compactMessages(system, persisted, Math.min(budget.maxContextTokens!, remaining - maxOutput!), extraTokens)
        : compactAdaptiveMessages(system, persisted, budget.maxContextTokens!, extraTokens);
      if (compact.removed) ctx.emit({ type: 'log', level: 'info', text: `Compacted ${compact.removed} older messages to keep this request within its context budget.` });
      const requestBody = {
        model, messages: compact.messages,
        ...(strict ? (isOpenAI ? { max_completion_tokens: maxOutput } : { max_tokens: maxOutput }) : {}),
        ...(toolDefs.length && !lastStep ? { tools: toolDefs, tool_choice: 'auto' } : {}),
        ...(isOpenAI && ctx.dot.reasoningEffort ? { reasoning_effort: ctx.dot.reasoningEffort } : {}),
        ...(usageSupported ? { stream_options: { include_usage: true } } : {}),
      };
      const draftId = `draft-${step}`;
      let lastDraft = 0;

      const request = () => chatCompletion({
        baseUrl: this.profile.baseUrl,
        apiKey,
        signal: ctx.signal,
        onRetry: text => ctx.emit({ type: 'log', level: 'warn', text }),
        onText: (text) => {
          const now = Date.now();
          if (now - lastDraft > 120) {
            lastDraft = now;
            ctx.emit({ type: 'draft', id: draftId, text });
          }
        },
        body: { ...requestBody, model }
      });
      let result;
      let contextRetries = 0;
      for (;;) {
        try { result = await request(); break; }
        catch (error) {
          if (!strict && !ctx.signal.aborted && error instanceof ProviderError && contextRetries < 2 && /context_length_exceeded|(?:maximum|exceed|limit).*context|context.*(?:length|window|exceed)|too many tokens/i.test(error.message)) {
            const smaller = Math.floor((estimateTokens(JSON.stringify(requestBody.messages)) + extraTokens) * .65);
            try {
              const reduced = compactMessages(system, persisted, smaller, extraTokens);
              if (JSON.stringify(reduced.messages) === JSON.stringify(requestBody.messages)) throw error;
              requestBody.messages = reduced.messages;
            } catch { throw error; }
            contextRetries++;
            ctx.emit({ type: 'log', level: 'info', text: 'The provider needs a smaller context. Compacting older activity and retrying with tools preserved.' });
            continue;
          }
          if (ctx.signal.aborted || !(error instanceof ProviderError) || !/\((429|5\d\d)\)/.test(error.message) || !fallbackModels.length) throw error;
          model = fallbackModels.shift()!;
          ctx.emit({ type: 'log', level: 'warn', text: `Trying your fallback model: ${model}.` });
        }
      }
      const usage = result.usage || { inputTokens: estimateTokens(JSON.stringify(requestBody)), outputTokens: estimateTokens(result.content + JSON.stringify(result.toolCalls)) };
      total.inputTokens += usage.inputTokens;
      total.outputTokens += usage.outputTokens;
      total.cachedTokens = (total.cachedTokens || 0) + (usage.cachedTokens || 0);
      if (!result.usage) total.estimated = true;
      ctx.emit({ type: 'usage', usage: { ...total } });

      const assistant: ChatMessage = { role: 'assistant', content: result.content || null };
      if (result.toolCalls.length && !lastStep) assistant.tool_calls = result.toolCalls;
      if (result.content) ctx.emit({ type: 'message', id: draftId, text: result.content });

      if (!assistant.tool_calls) {
        finalMessage = result.content;
        persisted.push(assistant);
        if (lastStep) ctx.emit({ type: 'log', level: 'warn', text: strict ? `Wrapped up at the ${step > maxSteps ? 'step' : 'token'} allowance with a final progress report.` : 'Stopped after the 500-round loop safeguard. Review the completed activity before continuing.' });
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
      const msg = 'Error: the tool arguments were not valid JSON. If a large write was cut off, retry with a smaller first chunk, then use write_file with append:true for later chunks.';
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
      return clip(out, Math.min(STORED_TOOL_OUTPUT, (ctx.dot.budget.maxContextTokens || 12_000) <= 6000 ? 1600 : STORED_TOOL_OUTPUT));
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
- For a file task, use write_file or edit_file to create the actual deliverable and verify it. For large files, write smaller chunks and use write_file with append:true for subsequent chunks. Do not replace the requested file with a plan or a description.
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
