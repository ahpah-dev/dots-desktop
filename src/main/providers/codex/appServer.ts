import { createInterface } from 'node:readline';
import type { ChildProcess } from 'node:child_process';
import { killTree, spawnCodex } from './locator';
import { createLogger } from '../../util/logger';

const log = createLogger('codex-rpc');

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout };
export type Notification = { method: string; params: any };

/**
 * Minimal JSON-RPC client for `codex app-server` (the same protocol Codex's own IDE
 * integrations use). We use it only for official account/model operations, so credentials
 * are always handled by Codex itself and never read by this app.
 */
export class AppServerSession {
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private closed = false;
  private notificationListeners = new Set<(n: Notification) => void>();

  private constructor(private child: ChildProcess) {}

  static async open(exe: string, args: string[] = []): Promise<AppServerSession> {
    const child = spawnCodex(exe, ['app-server', ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    const session = new AppServerSession(child);
    session.wire();
    try {
      await session.request('initialize', { clientInfo: { name: 'dots-desktop', title: 'Dots', version: '1.0.0' } }, 20_000);
      session.write({ jsonrpc: '2.0', method: 'initialized', params: {} });
    } catch (err) {
      session.close();
      throw err;
    }
    return session;
  }

  private wire(): void {
    const rl = createInterface({ input: this.child.stdout! });
    rl.on('line', (line) => this.onLine(line));
    this.child.stderr?.on('data', (d) => log.debug(String(d).trim().slice(0, 500)));
    this.child.on('error', (err) => this.failAll(err));
    this.child.on('close', () => {
      this.closed = true;
      this.failAll(new Error('The Codex process ended unexpectedly.'));
    });
    this.child.stdin?.on('error', () => undefined);
  }

  private onLine(line: string): void {
    let msg: any;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined) && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(msg.error.message ?? 'Codex request failed'));
      else p.resolve(msg.result);
    } else if (msg.method && msg.id !== undefined) {
      // Server → client request (e.g. approvals). We don't service any; decline so Codex never blocks.
      this.write({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Not supported by this client' } });
    } else if (msg.method) {
      for (const l of this.notificationListeners) l({ method: msg.method, params: msg.params });
    }
  }

  onNotification(fn: (n: Notification) => void): () => void {
    this.notificationListeners.add(fn);
    return () => this.notificationListeners.delete(fn);
  }

  private write(obj: unknown): void {
    if (this.closed) return;
    try { this.child.stdin?.write(`${JSON.stringify(obj)}\n`); } catch { /* process is gone */ }
  }

  request<T = any>(method: string, params: unknown = {}, timeoutMs = 15_000): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Codex connection is closed.'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex did not respond to "${method}" in time.`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.write({ jsonrpc: '2.0', id, method, params });
    });
  }

  private failAll(err: Error): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      try { this.child.stdin?.end(); } catch { /* ignore */ }
      killTree(this.child);
    }
    this.failAll(new Error('Codex connection closed.'));
  }
}
