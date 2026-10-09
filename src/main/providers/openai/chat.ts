import { CancelledError, ProviderError } from '../types';
import { sleep } from '../../util/misc';
import type { ModelInfo } from '@shared/types';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
  usage?: { inputTokens: number; outputTokens: number; cachedTokens?: number };
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

function friendly(err: HttpError): ProviderError {
  switch (err.status) {
    case 401:
    case 403:
      return new ProviderError(`The provider rejected the API key (${err.status}). ${err.message}`.trim(), 'auth');
    case 404:
      return new ProviderError(`Not found (404). Check the base URL and model name. ${err.message}`.trim());
    case 429:
      return new ProviderError(`Rate limited or out of quota (429). ${err.message}`.trim());
    default:
      return new ProviderError(`The provider returned an error (${err.status}). ${err.message}`.trim());
  }
}

async function readError(res: Response): Promise<HttpError> {
  const text = await res.text().catch(() => '');
  let msg = text.slice(0, 500);
  try {
    const j = JSON.parse(text);
    msg = j?.error?.message ?? j?.message ?? msg;
  } catch { /* plain text */ }
  const ra = Number(res.headers.get('retry-after'));
  return new HttpError(res.status, msg, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
}

export async function listModelDetails(baseUrl: string, apiKey: string, signal: AbortSignal): Promise<ModelInfo[]> {
  const res = await fetch(`${baseUrl}/models`, { headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {}, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) })
    .catch((e) => { throw new ProviderError(`Couldn't reach ${baseUrl}: ${e instanceof Error ? e.message : e}`); });
  if (!res.ok) throw friendly(await readError(res));
  const j: any = await res.json();
  if (!Array.isArray(j.data)) throw new ProviderError('The endpoint did not return a compatible model list. Check its API base URL.');
  return j.data.filter((model: any) => typeof model.id === 'string').map((model: any) => ({
    id: model.id, label: model.name || model.id,
    contextWindow: typeof model.context_length === 'number' ? model.context_length : typeof model.capabilities?.contextWindow === 'number' ? model.capabilities.contextWindow : undefined,
    supportsTools: typeof model.capabilities?.tools === 'boolean' ? model.capabilities.tools : Array.isArray(model.supported_parameters) ? model.supported_parameters.includes('tools') : undefined,
    free: typeof model.free === 'boolean' ? model.free : /(?:[:/-]free)$/.test(model.id) || (model.pricing?.prompt !== undefined && model.pricing?.completion !== undefined && Number(model.pricing.prompt) === 0 && Number(model.pricing.completion) === 0),
  })).sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));
}
export async function listModelIds(baseUrl: string, apiKey: string, signal: AbortSignal): Promise<string[]> {
  return (await listModelDetails(baseUrl, apiKey, signal)).map(model => model.id);
}

interface ChatOptions {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  signal: AbortSignal;
  onText?: (fullText: string) => void;
  onRetry?: (message: string) => void;
}

/** One chat-completions call with streaming, retries (429/5xx/network) and exponential backoff. */
export async function chatCompletion(opts: ChatOptions): Promise<ChatResult> {
  const maxAttempts = 4;
  for (let attempt = 1; ; attempt++) {
    if (opts.signal.aborted) throw new CancelledError();
    try {
      return await attemptChat(opts);
    } catch (err) {
      if (opts.signal.aborted) throw new CancelledError();
      const retriable =
        (err instanceof HttpError && (err.status === 429 || err.status >= 500)) ||
        (!(err instanceof HttpError) && !(err instanceof ProviderError) && !(err instanceof CancelledError));
      if (!retriable || attempt >= maxAttempts) {
        if (err instanceof HttpError) throw friendly(err);
        if (err instanceof ProviderError || err instanceof CancelledError) throw err;
        throw new ProviderError(`Network error talking to the provider: ${err instanceof Error ? err.message : String(err)}`);
      }
      const wait = err instanceof HttpError && err.retryAfterMs ? Math.min(err.retryAfterMs, 60_000) : 1000 * 2 ** (attempt - 1);
      opts.onRetry?.(`Provider busy or temporarily unavailable. Retrying in ${Math.ceil(wait / 1000)}s (${attempt}/${maxAttempts - 1}).`);
      await sleep(wait, opts.signal);
    }
  }
}

async function attemptChat(opts: ChatOptions): Promise<ChatResult> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}), accept: 'text/event-stream, application/json' },
    body: JSON.stringify({ ...opts.body, stream: true }),
    signal: opts.signal
  });
  if (!res.ok) throw await readError(res);

  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/event-stream') || !res.body) {
    // Server ignored `stream: true` — parse a normal JSON completion.
    const j: any = await res.json();
    const choice = j.choices?.[0];
    const content = choice?.message?.content ?? '';
    if (content) opts.onText?.(content);
    return {
      content,
      toolCalls: (choice?.message?.tool_calls ?? []) as ToolCall[],
      finishReason: choice?.finish_reason ?? null,
      usage: j.usage ? { inputTokens: j.usage.prompt_tokens ?? 0, outputTokens: j.usage.completion_tokens ?? 0, cachedTokens: j.usage.prompt_tokens_details?.cached_tokens ?? 0 } : undefined
    };
  }

  let content = '';
  let finishReason: string | null = null;
  let usage: ChatResult['usage'];
  const calls: ToolCall[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  const handle = (data: string) => {
    if (data === '[DONE]') return;
    let j: any;
    try { j = JSON.parse(data); } catch { return; }
    if (j.error) throw new ProviderError(j.error.message ?? 'The provider reported an error mid-stream.');
    if (j.usage) usage = { inputTokens: j.usage.prompt_tokens ?? 0, outputTokens: j.usage.completion_tokens ?? 0, cachedTokens: j.usage.prompt_tokens_details?.cached_tokens ?? 0 };
    const choice = j.choices?.[0];
    if (!choice) return;
    const delta = choice.delta ?? {};
    if (typeof delta.content === 'string' && delta.content) {
      content += delta.content;
      opts.onText?.(content);
    }
    for (const tc of delta.tool_calls ?? []) {
      const i = tc.index ?? 0;
      calls[i] ??= { id: '', type: 'function', function: { name: '', arguments: '' } };
      if (tc.id) calls[i].id = tc.id;
      if (tc.function?.name) calls[i].function.name += tc.function.name;
      if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx).replace(/^\r?\n\r?\n/, '');
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith('data:')) handle(line.slice(5).trim());
      }
    }
  }
  if (buf.trim().startsWith('data:')) handle(buf.trim().slice(5).trim());

  const toolCalls = calls.filter(Boolean).map((c, i) => ({ ...c, id: c.id || `call_${Date.now()}_${i}` }));
  return { content, toolCalls, finishReason, usage };
}
