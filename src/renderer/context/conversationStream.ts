import type { RunEvent } from '@shared/types';

const EMPTY_EVENTS: RunEvent[] = [];
const LIVE_UPDATE_INTERVAL = 40;
type LiveDraft = { id: string; text: string; afterSequence: number; episodeStart: number };
const isTerminal = (event: RunEvent): boolean => event.type === 'final' ||
  (event.type === 'status' && event.status !== 'running' && event.status !== 'queued') ||
  (event.type === 'usage' && !!event.turnCompleted);

/**
 * Streaming data lives outside the application context so a token never makes
 * the sidebar, profile form, or project files render again. Keep file/tool
 * events and text on separate subscriptions for the same reason.
 */
export class ConversationStream {
  private runId: string | null = null;
  private events: RunEvent[] = EMPTY_EVENTS;
  private draft: LiveDraft | null = null;
  private sequences = new Set<number>();
  private pendingEvents = new Map<number, RunEvent>();
  private pendingDraft: LiveDraft | null | undefined;
  private lastSequence = 0;
  private runningSequence = 0;
  private terminalSequence = 0;
  private completedMessages = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private eventListeners = new Set<() => void>();
  private draftListeners = new Set<() => void>();

  getEvents = (): RunEvent[] => this.events;
  getDraft = (): string | null => this.draft?.text ?? null;
  subscribeEvents = (listener: () => void): (() => void) => {
    this.eventListeners.add(listener);
    return () => { this.eventListeners.delete(listener); };
  };
  subscribeDraft = (listener: () => void): (() => void) => {
    this.draftListeners.add(listener);
    return () => { this.draftListeners.delete(listener); };
  };

  selectRun(runId: string | null): void {
    if (this.runId === runId) return;
    this.cancelPending();
    this.runId = runId;
    this.sequences.clear();
    this.completedMessages.clear();
    this.lastSequence = this.runningSequence = this.terminalSequence = 0;
    const hadEvents = this.events.length > 0;
    const hadDraft = this.draft !== null;
    this.events = EMPTY_EVENTS;
    this.draft = null;
    if (hadEvents) this.eventListeners.forEach(listener => listener());
    if (hadDraft) this.draftListeners.forEach(listener => listener());
  }

  receive(event: RunEvent): void {
    if (event.runId !== this.runId) return;
    if (event.type === 'draft') {
      // IPC snapshots can overtake queued streaming pushes. Never bring back
      // text for an already completed answer or finished run. A genuinely
      // resumed episode has a newer running-status sequence.
      const completedSequence = this.completedMessages.get(event.id);
      if ((this.terminalSequence > 0 && this.terminalSequence >= this.runningSequence) ||
        (completedSequence !== undefined && completedSequence >= this.runningSequence)) return;
      this.pendingDraft = { id: event.id, text: event.text, afterSequence: this.lastSequence, episodeStart: this.runningSequence };
    } else {
      // RunStore sequences are unique. Checking a Set avoids a scan of the
      // complete conversation for every new tool/output event.
      if (this.sequences.has(event.seq)) {
        const draft = this.pendingDraft !== undefined ? this.pendingDraft : this.draft;
        if (draft && this.completesDraft(event, draft)) { this.pendingDraft = null; this.flush(); }
        return;
      }
      this.recordBoundary(event);
      this.sequences.add(event.seq);
      this.pendingEvents.set(event.seq, event);
      this.pendingDraft = null;
    }

    if (event.type === 'message' || isTerminal(event)) {
      this.flush();
    } else if (this.timer === undefined) {
      this.timer = setTimeout(() => this.flush(), LIVE_UPDATE_INTERVAL);
    }
  }

  mergeSnapshot(runId: string, snapshot: RunEvent[]): void {
    if (runId !== this.runId) return;
    const merged = new Map<number, RunEvent>();
    for (const event of snapshot) {
      if (event.runId === runId && event.type !== 'draft') merged.set(event.seq, event);
    }
    // Pushes received while IPC was reading disk are newer than that snapshot.
    for (const event of this.events) merged.set(event.seq, event);
    for (const event of this.pendingEvents.values()) merged.set(event.seq, event);
    this.pendingEvents.clear();
    const next = [...merged.values()].sort((a, b) => a.seq - b.seq);
    for (const event of next) { this.sequences.add(event.seq); this.recordBoundary(event); }
    const previousDraft = this.getDraft();
    let draft = this.pendingDraft !== undefined ? this.pendingDraft : this.draft;
    if (draft && next.some(event => this.completesDraft(event, draft!))) draft = null;
    this.draft = draft;
    this.pendingDraft = undefined;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    const eventsChanged = next.length !== this.events.length || next.some((event, index) => event !== this.events[index]);
    this.events = next.length ? next : EMPTY_EVENTS;
    // Even a no-op event snapshot may retire a draft. Commit both snapshots
    // before notifying subscribers so the completed answer never has a second
    // raw, spinning copy underneath it.
    if (eventsChanged) this.eventListeners.forEach(listener => listener());
    if (previousDraft !== this.getDraft()) this.draftListeners.forEach(listener => listener());
  }

  flush(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    let eventsChanged = false;
    let draftChanged = false;
    if (this.pendingEvents.size) {
      const pending = [...this.pendingEvents.values()].sort((a, b) => a.seq - b.seq);
      this.pendingEvents.clear();
      const lastSequence = this.events[this.events.length - 1]?.seq ?? -1;
      // Normal live events append in order. Only a delayed/out-of-order event
      // needs to sort history, instead of rebuilding a Map on each append.
      this.events = pending[0].seq > lastSequence
        ? [...this.events, ...pending]
        : [...this.events, ...pending].sort((a, b) => a.seq - b.seq);
      eventsChanged = true;
    }
    if (this.pendingDraft !== undefined) {
      const next = this.pendingDraft;
      this.pendingDraft = undefined;
      draftChanged = (next?.text ?? null) !== this.getDraft();
      this.draft = next;
    }
    // Apply both snapshots before waking React, including a final message that
    // replaces its live draft in the same update.
    if (eventsChanged) this.eventListeners.forEach(listener => listener());
    if (draftChanged) this.draftListeners.forEach(listener => listener());
  }

  dispose(): void {
    this.cancelPending();
  }

  private cancelPending(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    this.pendingEvents.clear();
    this.pendingDraft = undefined;
  }

  private recordBoundary(event: RunEvent): void {
    this.lastSequence = Math.max(this.lastSequence, event.seq);
    if (event.type === 'status' && event.status === 'running') this.runningSequence = Math.max(this.runningSequence, event.seq);
    if (isTerminal(event)) this.terminalSequence = Math.max(this.terminalSequence, event.seq);
    if (event.type === 'message') this.completedMessages.set(event.id, Math.max(this.completedMessages.get(event.id) ?? 0, event.seq));
  }

  private completesDraft(event: RunEvent, draft: LiveDraft): boolean {
    return (event.type === 'message' && event.id === draft.id && event.seq >= draft.episodeStart) ||
      (isTerminal(event) && event.seq > draft.afterSequence);
  }
}
