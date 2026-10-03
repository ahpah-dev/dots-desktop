import { appendFileSync, mkdirSync, renameSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from 'node:util';

type Level = 'debug' | 'info' | 'warn' | 'error';

const MAX_BYTES = 2 * 1024 * 1024;
let dir: string | null = null;

export function initLogger(logDir: string): void {
  dir = logDir;
  try {
    mkdirSync(logDir, { recursive: true });
  } catch {
    dir = null;
  }
}

function write(level: Level, scope: string, args: unknown[]): void {
  const msg = args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 4, breakLength: 160 }))).join(' ');
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}\n`;
  if (level === 'error' || level === 'warn') process.stderr.write(line);
  else if (process.env.VITE_DEV_SERVER_URL) process.stdout.write(line);
  if (!dir) return;
  const file = join(dir, 'app.log');
  try {
    if (existsSync(file) && statSync(file).size > MAX_BYTES) renameSync(file, join(dir, 'app.old.log'));
    appendFileSync(file, line);
  } catch {
    /* logging must never throw */
  }
}

export function createLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => write('debug', scope, a),
    info: (...a: unknown[]) => write('info', scope, a),
    warn: (...a: unknown[]) => write('warn', scope, a),
    error: (...a: unknown[]) => write('error', scope, a)
  };
}

export type Logger = ReturnType<typeof createLogger>;
