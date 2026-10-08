import { createInterface } from 'node:readline';
import type { Dot, ModelInfo } from '@shared/types';
import { CODEX_PROVIDER_ID } from '@shared/types';
import {
  CancelledError,
  ProviderError,
  type AgentProvider,
  type ProviderResult,
  type RunContext
} from '../types';
import type { CodexAuthService } from './auth';
import { killTree, spawnCodex } from './locator';
import { CodexEventTranslator, humanizeCodexError } from './events';
import { createLogger } from '../../util/logger';
import { buildWorkInstructions } from '../../engine/workStyle';

const log = createLogger('codex');

/** Included on fresh and resumed turns so changed work styles take effect immediately. */
export function buildCodexPrompt(ctx: Pick<RunContext, 'context' | 'dot' | 'prompt'>): string {
  return `${ctx.context}\n\n${buildWorkInstructions(ctx.dot.budget)}\n\n---\n# Your task\n${ctx.prompt}\n`;
}

/** Translate a Dot's permissions into Codex CLI configuration overrides. */
export function buildCodexConfigArgs(dot: Dot, model: string | undefined, useUserConfig: boolean): string[] {
  const p = dot.permissions;
  const args: string[] = [];
  if (!useUserConfig) args.push('--ignore-user-config');
  if (model) args.push('-m', model);
  if (dot.reasoningEffort) args.push('-c', `model_reasoning_effort=${dot.reasoningEffort}`);
  args.push('-c', `features.shell_tool=${p.shell}`);
  args.push('-c', 'shell_environment_policy.ignore_default_excludes=false');

  // On Windows, configure elevated sandbox mode so shell CreateProcess is not blocked by Windows container policy
  if (process.platform === 'win32' && p.shell) {
    args.push('-c', 'windows.sandbox=elevated');
  }

  if (p.outsideWorkspace) {
    args.push('--dangerously-bypass-approvals-and-sandbox');
  } else {
    const sandbox = p.files === 'write' ? 'workspace-write' : 'read-only';
    args.push('-c', `sandbox_mode=${sandbox}`);
    args.push('-c', 'approval_policy=never'); // headless: nobody is there to approve; the sandbox is the guardrail
    if (sandbox === 'workspace-write') args.push('-c', `sandbox_workspace_write.network_access=${p.web}`);
  }

  args.push('-c', `web_search=${p.web ? 'live' : 'disabled'}`);
  return args;
}

/** Runs tasks with the official OpenAI Codex CLI (`codex exec --json`), using the user's Codex sign-in. */
export class CodexProvider implements AgentProvider {
  readonly id = CODEX_PROVIDER_ID;
  readonly label = 'OpenAI Codex';

  constructor(private auth: CodexAuthService) {}

  listModels(): Promise<ModelInfo[]> {
    return this.auth.models();
  }

  async test(): Promise<{ ok: boolean; message: string }> {
    const s = await this.auth.status(true);
    if (!s.installed) return { ok: false, message: 'Codex CLI not found.' };
    if (!s.loggedIn) return { ok: false, message: 'Codex is not signed in.' };
    const who = s.mode === 'chatgpt' ? `ChatGPT${s.plan ? ` ${s.plan}` : ''}${s.email ? ` (${s.email})` : ''}` : 'API key';
    return { ok: true, message: `Connected via ${who}. Codex ${s.codexVersion ?? ''}`.trim() };
  }

  async run(ctx: RunContext): Promise<ProviderResult> {
    if (ctx.dot.permissions.approval === 'ask' || ctx.dot.permissions.rules?.some((rule) => rule.effect === 'ask' || rule.effect === 'deny')) {
      throw new ProviderError('Action approvals and custom ask/deny rules need an OpenAI-compatible provider, which enforces them on each tool call. Switch this Dot\'s provider or remove those approval requirements before running Codex.');
    }
    const exe = this.auth.path();
    if (!exe) throw new ProviderError('The Codex CLI was not found. Install Codex or point Dots at it in Settings → Accounts.');
    const status = await this.auth.status();
    if (!status.loggedIn) throw new ProviderError('Codex is not signed in. Sign in from Settings → Accounts.');

    let model: string | undefined = ctx.dot.model && ctx.dot.model !== 'auto' ? ctx.dot.model : undefined;
    if (!model) {
      const models = await this.auth.models();
      model = (models.find((m) => m.isDefault) ?? models[0])?.id;
    }

    const resumeId = !ctx.newSession ? ctx.resumeThreadId : null;
    try {
      return await this.exec(ctx, exe, model, resumeId);
    } catch (err) {
      // A stale/deleted session id shouldn't block the Dot forever: retry once with a fresh session.
      if (resumeId && err instanceof ProviderError && err.hint === 'no-turn' && !ctx.signal.aborted) {
        ctx.emit({ type: 'log', level: 'warn', text: 'The previous Codex session could not be resumed; starting a new one.' });
        return this.exec(ctx, exe, model, null);
      }
      throw err;
    }
  }

  private exec(ctx: RunContext, exe: string, model: string | undefined, resumeId: string | null): Promise<ProviderResult> {
    const cfg = buildCodexConfigArgs(ctx.dot, model, ctx.settings.useCodexUserConfig);
    const args = ['exec', ...(resumeId ? ['resume'] : []), '--json', '--skip-git-repo-check', ...cfg, ...(resumeId ? [resumeId] : []), '-'];
    log.info('spawn', exe, args.join(' '));

    return new Promise<ProviderResult>((resolve, reject) => {
      if (ctx.signal.aborted) return reject(new CancelledError());
      const child = spawnCodex(exe, args, { cwd: ctx.dot.workspacePath, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
      const tr = new CodexEventTranslator(ctx.emit, ctx.setThreadId);
      let stderrTail = '';
      let settled = false;

      const onAbort = () => killTree(child);
      ctx.signal.addEventListener('abort', onAbort, { once: true });

      createInterface({ input: child.stdout! }).on('line', (line) => {
        const t = line.trim();
        if (!t.startsWith('{')) return;
        try { tr.handle(JSON.parse(t)); } catch { /* ignore malformed line */ }
      });
      child.stderr?.on('data', (d) => {
        stderrTail = (stderrTail + String(d)).slice(-4000);
      });
      child.stdin?.on('error', () => undefined);
      child.stdin?.end(buildCodexPrompt(ctx));

      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        ctx.signal.removeEventListener('abort', onAbort);
        fn();
      };

      child.on('error', (err) => done(() => reject(new ProviderError(`Couldn't start Codex: ${err.message}`))));
      child.on('close', (code) => {
        done(() => {
          if (ctx.signal.aborted) return reject(new CancelledError());
          if (tr.failure) return reject(new ProviderError(tr.failure, tr.turnStarted ? undefined : 'no-turn'));
          if (code !== 0) {
            const detail = stderrTail.split('\n').filter((l) => l.trim() && !/ERROR codex_models_manager/.test(l)).slice(-6).join('\n');
            return reject(new ProviderError(humanizeCodexError(detail || `Codex exited with code ${code}.`), tr.turnStarted ? undefined : 'no-turn'));
          }
          resolve({ finalMessage: tr.finalMessage, usage: tr.usage });
        });
      });
    });
  }
}
