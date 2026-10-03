import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

/** Serialises async writes per file so concurrent saves never interleave. */
const queues = new Map<string, Promise<unknown>>();

function enqueue<T>(file: string, task: () => Promise<T>): Promise<T> {
  const prev = queues.get(file) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(task);
  queues.set(file, next);
  void next.finally(() => {
    if (queues.get(file) === next) queues.delete(file);
  }).catch(() => undefined);
  return next;
}

/** Atomically write JSON: write to a temp file, then rename over the target. */
export function writeJson(file: string, data: unknown): Promise<void> {
  return enqueue(file, async () => {
    await fs.mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await renameWithRetry(tmp, file);
  });
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  // On Windows, rename can transiently fail with EPERM/EBUSY when AV or indexers hold the file.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 6 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) {
        await fs.rm(from, { force: true }).catch(() => undefined);
        throw err;
      }
      await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
    }
  }
}

/**
 * Read JSON. A missing file yields the fallback. A corrupt file is moved aside
 * (so data is never silently destroyed) and the fallback is returned.
 */
export async function readJson<T>(file: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    await fs.rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
    return fallback;
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
