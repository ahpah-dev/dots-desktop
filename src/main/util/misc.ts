import { randomUUID } from 'node:crypto';

export const uid = (): string => randomUUID();

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
  });

/** Truncate long text in the middle, keeping head and tail (useful for tool output). */
export function clip(text: string, max = 8000): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n… [${text.length - max} characters truncated] …\n${text.slice(-half)}`;
}

export function firstLine(text: string, max = 80): string {
  const line = text.trim().split(/\r?\n/)[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

/** Minimal typed event emitter. */
export class Emitter<T> {
  private listeners = new Set<(v: T) => void>();
  on(fn: (v: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(v: T): void {
    for (const l of [...this.listeners]) {
      try { l(v); } catch { /* listener errors must not break the emitter */ }
    }
  }
}
