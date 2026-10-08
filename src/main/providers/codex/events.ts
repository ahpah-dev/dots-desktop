import type { RunEventBody, ToolStatus, Usage } from '@shared/types';

/** Turn Codex's raw error payloads (often JSON strings) into something a person can act on. */
export function humanizeCodexError(raw: string): string {
  let msg = raw;
  try {
    const parsed = JSON.parse(raw);
    msg = parsed?.error?.message ?? parsed?.message ?? raw;
  } catch { /* not JSON */ }
  if (/not supported when using Codex with a ChatGPT account/i.test(msg)) {
    return `${msg} Open this Dot's settings and choose a different model (or "Automatic").`;
  }
  if (/401|unauthorized|token.*(expired|invalid)|sign in again|log in again/i.test(msg)) {
    return `${msg} Your Codex session may have expired — sign in again from Settings → Accounts.`;
  }
  if (/usage limit|rate limit|quota/i.test(msg)) {
    return `${msg} You've hit a usage limit; the task can be retried later.`;
  }
  return msg;
}

/** Make shell wrapper noise (`powershell.exe -Command …`, `bash -lc '…'`) readable. */
export function prettifyCommand(cmd: string): string {
  const ps = /^"?[^"]*?(?:powershell|pwsh)(?:\.exe)?"?\s+(?:-\w+\s+)*-Command\s+([\s\S]+)$/i.exec(cmd);
  if (ps) return stripOuterQuotes(ps[1]);
  const sh = /^(?:\/\S+\/)?(?:bash|zsh|sh)\s+-l?c\s+([\s\S]+)$/.exec(cmd);
  if (sh) return stripOuterQuotes(sh[1]);
  const cmdexe = /^"?[^"]*?cmd(?:\.exe)?"?\s+\/c\s+([\s\S]+)$/i.exec(cmd);
  if (cmdexe) return stripOuterQuotes(cmdexe[1]);
  return cmd;
}

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) return t.slice(1, -1);
  return t;
}

/**
 * Translates `codex exec --json` JSONL events into the app's provider-neutral {@link RunEventBody}s.
 * Pure and synchronous so it can be unit-tested with recorded event streams.
 */
export class CodexEventTranslator {
  finalMessage = '';
  threadId: string | null = null;
  usage: Usage | undefined;
  failure: string | undefined;
  turnStarted = false;

  constructor(
    private emit: (e: RunEventBody) => void,
    private onThread: (id: string) => void
  ) {}

  handle(ev: any): void {
    if (!ev || typeof ev !== 'object') return;
    switch (ev.type) {
      case 'thread.started':
        this.threadId = ev.thread_id ?? null;
        if (this.threadId) this.onThread(this.threadId);
        break;
      case 'turn.started':
        this.turnStarted = true;
        break;
      case 'turn.completed':
        if (ev.usage) {
          this.usage = {
            inputTokens: ev.usage.input_tokens ?? 0,
            outputTokens: (ev.usage.output_tokens ?? 0) + (ev.usage.reasoning_output_tokens ?? 0),
            cachedTokens: ev.usage.cached_input_tokens
          };
          this.emit({ type: 'usage', usage: this.usage, turnCompleted: true });
        }
        break;
      case 'turn.failed':
        this.failure ??= humanizeCodexError(ev.error?.message ?? 'The task failed.');
        break;
      case 'error':
        this.failure ??= humanizeCodexError(ev.message ?? 'Codex reported an error.');
        break;
      case 'item.started':
      case 'item.updated':
      case 'item.completed':
        this.item(ev.item, ev.type === 'item.completed');
        break;
      default:
        break;
    }
  }

  private item(item: any, done: boolean): void {
    if (!item) return;
    const id = String(item.id ?? `${item.type}-${Math.random().toString(36).slice(2)}`);
    switch (item.type) {
      case 'agent_message':
        if (done && item.text) {
          this.finalMessage = item.text;
          this.emit({ type: 'message', id, text: item.text });
        }
        break;
      case 'reasoning':
        if (done && item.text) this.emit({ type: 'reasoning', id, text: item.text });
        break;
      case 'command_execution': {
        const failed = item.status === 'failed' || (typeof item.exit_code === 'number' && item.exit_code !== 0);
        const status: ToolStatus = !done && item.status !== 'completed' && item.status !== 'failed' ? 'running' : failed ? 'error' : 'ok';
        this.emit({
          type: 'tool', id, category: 'shell', name: 'Shell',
          input: prettifyCommand(String(item.command ?? '')),
          output: item.aggregated_output || undefined,
          status
        });
        break;
      }
      case 'file_change': {
        const changes: { path: string; kind: string }[] = item.changes ?? [];
        this.emit({
          type: 'tool', id, category: 'file', name: 'Edit files',
          input: changes.map((c) => `${c.kind} ${c.path}`).join('\n'),
          status: !done ? 'running' : item.status === 'failed' ? 'error' : 'ok'
        });
        if (done && item.status !== 'failed') {
          for (const c of changes) {
            const change = c.kind === 'add' ? 'add' : c.kind === 'delete' ? 'delete' : 'update';
            this.emit({ type: 'file', path: c.path, change });
          }
        }
        break;
      }
      case 'mcp_tool_call':
        this.emit({
          type: 'tool', id, category: 'mcp', name: `${item.server ?? 'mcp'} · ${item.tool ?? 'tool'}`,
          input: item.arguments !== undefined ? safeJson(item.arguments) : undefined,
          output: done ? (item.error?.message ?? (item.result !== undefined ? safeJson(item.result) : undefined)) : undefined,
          status: !done ? 'running' : item.status === 'failed' || item.error ? 'error' : 'ok'
        });
        break;
      case 'web_search': {
        const query = String(item.query ?? '');
        this.emit({
          type: 'tool', id, category: 'search', name: 'Web search',
          input: query || undefined,
          status: done ? 'ok' : 'running'
        });
        break;
      }
      case 'todo_list':
        this.emit({ type: 'plan', items: (item.items ?? []).map((i: any) => ({ text: String(i.text ?? ''), done: !!i.completed })) });
        break;
      case 'error':
        if (item.message && !/^Model metadata for/i.test(item.message)) {
          this.emit({ type: 'log', level: 'warn', text: String(item.message) });
        }
        break;
      default:
        break;
    }
  }
}

function safeJson(v: unknown): string {
  try { return typeof v === 'string' ? v : JSON.stringify(v, null, 2); } catch { return String(v); }
}
