import type { ApprovalRequest } from '@shared/types';
import { Emitter, uid } from '../util/misc';
import type { ApprovalPrompt } from '../providers/types';

const APPROVAL_TIMEOUT_MS = 30 * 60_000;

interface Pending {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
  timer: NodeJS.Timeout;
}

/**
 * Holds actions awaiting a human decision. Unanswered requests are denied after a timeout so an
 * unattended background run can never hang forever, and are denied when their run is cancelled.
 */
export class ApprovalGate {
  private pending = new Map<string, Pending>();
  readonly requested = new Emitter<ApprovalRequest>();
  readonly resolved = new Emitter<string>();

  request(ctx: { runId: string; dotId: string; dotName: string }, prompt: ApprovalPrompt, signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const request: ApprovalRequest = { id: uid(), ...ctx, ...prompt, createdAt: Date.now() };
    return new Promise<boolean>((resolve) => {
      const finish = (approved: boolean) => {
        const p = this.pending.get(request.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(request.id);
        signal.removeEventListener('abort', onAbort);
        this.resolved.emit(request.id);
        resolve(approved);
      };
      const onAbort = () => finish(false);
      signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => finish(false), APPROVAL_TIMEOUT_MS);
      this.pending.set(request.id, { request, resolve: finish, timer });
      this.requested.emit(request);
    });
  }

  resolve(id: string, approved: boolean): void {
    this.pending.get(id)?.resolve(approved);
  }

  list(): ApprovalRequest[] {
    return [...this.pending.values()].map((p) => p.request);
  }

  hasPendingForDot(dotId: string): boolean {
    return this.list().some((r) => r.dotId === dotId);
  }
}
