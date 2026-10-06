import { spawn } from 'node:child_process';
import { clip } from '../util/misc';
import { killTree } from '../providers/codex/locator';
import { ToolError, num, str, type Tool } from './types';

const SECRET_ENV = /(API_?KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL)/i;

/** Child processes never inherit secrets from the app's environment. */
function scrubbedEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET_ENV.test(k)) env[k] = v;
  env.NO_COLOR = '1';
  return env;
}

export const runCommand: Tool = {
  name: 'run_command',
  description:
    process.platform === 'win32'
      ? 'Run a PowerShell command in the workspace and return its output (stdout+stderr, exit code).'
      : 'Run a shell command in the workspace and return its output (stdout+stderr, exit code).',
  category: 'shell',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      timeout_seconds: { type: 'number', description: 'Default 120, max 900.' }
    },
    required: ['command']
  },
  describe: (a) => String(a.command ?? ''),
  async run(args, ctx) {
    if (!ctx.permissions.shell) throw new ToolError('Running commands is not permitted for this Dot.');
    const command = str(args, 'command').trim();
    if (!command) throw new ToolError('Empty command.');
    // Read-only Dots may only run commands with explicit approval, since a shell can write anywhere.
    if (!ctx.actionApproved && (ctx.permissions.approval === 'ask' || ctx.permissions.files === 'read')) {
      const ok = await ctx.requestApproval({ kind: 'shell', summary: 'Run a command', detail: command });
      if (!ok) throw new ToolError('The user declined this command.');
    }
    const timeoutMs = Math.min(900, Math.max(1, num(args, 'timeout_seconds', 120))) * 1000;

    return new Promise<string>((resolve, reject) => {
      if (ctx.signal.aborted) return reject(new ToolError('Cancelled.'));
      const win = process.platform === 'win32';
      const child = win
        ? spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
            cwd: ctx.workspace, env: scrubbedEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
          })
        : spawn('/bin/sh', ['-c', command], { cwd: ctx.workspace, env: scrubbedEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });

      let out = '';
      const append = (d: Buffer) => { out = (out + d.toString('utf8')).slice(-200_000); };
      child.stdout?.on('data', append);
      child.stderr?.on('data', append);

      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
      const onAbort = () => killTree(child);
      ctx.signal.addEventListener('abort', onAbort, { once: true });

      child.on('error', (err) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', onAbort);
        reject(new ToolError(`Failed to start command: ${err.message}`));
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        ctx.signal.removeEventListener('abort', onAbort);
        const body = clip(out.trim() || '(no output)', 12_000);
        if (timedOut) return reject(new ToolError(`Command timed out after ${timeoutMs / 1000}s.\n${body}`));
        if (ctx.signal.aborted) return reject(new ToolError('Cancelled.'));
        if (code !== 0) return reject(new ToolError(`Exit code ${code}\n${body}`));
        resolve(body);
      });
    });
  }
};
