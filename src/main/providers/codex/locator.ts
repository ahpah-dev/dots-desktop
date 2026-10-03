import { spawn, execFile, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';

function isFile(p: string): boolean {
  try { return statSync(p).isFile(); } catch { return false; }
}

function candidatePaths(): string[] {
  const home = homedir();
  const out: string[] = [];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
    const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    out.push(
      join(local, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'),
      join(roaming, 'npm', 'codex.cmd'),
      join(local, 'Microsoft', 'WindowsApps', 'codex.exe')
    );
  } else {
    if (process.platform === 'darwin') out.push('/Applications/Codex.app/Contents/Resources/codex', '/opt/homebrew/bin/codex');
    out.push(
      '/usr/local/bin/codex',
      '/usr/bin/codex',
      join(home, '.local', 'bin', 'codex'),
      join(home, '.npm-global', 'bin', 'codex'),
      join(home, '.volta', 'bin', 'codex'),
      join(home, '.bun', 'bin', 'codex')
    );
  }
  return out;
}

/** Scan PATH manually (GUI apps on macOS/Linux often have a minimal PATH, hence the fallbacks above). */
function findOnPath(): string | undefined {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat'] : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = join(dir, `codex${ext}`);
      if (isFile(p)) return p;
    }
  }
  return undefined;
}

/** Locate the Codex CLI: explicit override → PATH → well-known install locations. */
export function locateCodex(override?: string): string | undefined {
  if (override && isFile(override)) return override;
  const onPath = findOnPath();
  if (onPath) return onPath;
  return candidatePaths().find((p) => existsSync(p) && isFile(p));
}

const quoteWin = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

/** Spawn Codex, handling npm `.cmd` shims on Windows (which require a shell). */
export function spawnCodex(exe: string, args: string[], opts: SpawnOptions = {}): ChildProcess {
  const needsShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(exe);
  if (needsShell) {
    return spawn(quoteWin(exe), args.map(quoteWin), { ...opts, shell: true, windowsHide: true });
  }
  return spawn(exe, args, { ...opts, windowsHide: true });
}

/** Terminate a process and all its children. */
export function killTree(child: ChildProcess): void {
  const pid = child.pid;
  if (!pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true }, () => undefined);
  } else {
    try { process.kill(-pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* already gone */ } }
    setTimeout(() => { try { process.kill(-pid, 'SIGKILL'); } catch { /* gone */ } }, 3000).unref();
  }
}

/** Run `codex --version`. */
export function codexVersion(exe: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawnCodex(exe, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout?.on('data', (d) => (out += d));
    const timer = setTimeout(() => { killTree(child); resolve(undefined); }, 8000);
    child.on('error', () => { clearTimeout(timer); resolve(undefined); });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(out.trim().replace(/^codex(-cli)?\s*/i, '') || undefined);
    });
  });
}
