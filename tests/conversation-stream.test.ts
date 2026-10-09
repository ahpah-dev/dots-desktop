import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunEvent, RunEventBody } from '../src/shared/types';
import { ConversationStream } from '../src/renderer/context/conversationStream';

const event = (seq: number, body: RunEventBody = { type: 'log', level: 'info', text: `Event ${seq}` }, runId = 'one'): RunEvent => ({
  ...body, seq, runId, dotId: 'dot', ts: seq,
});

describe('isolated conversation streaming', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('coalesces a burst of drafts while leaving file/tool subscribers asleep', () => {
    const stream = new ConversationStream();
    stream.selectRun('one');
    const eventsChanged = vi.fn(), draftChanged = vi.fn();
    stream.subscribeEvents(eventsChanged); stream.subscribeDraft(draftChanged);
    const snapshot = stream.getEvents();
    for (let chunk = 0; chunk < 500; chunk++) stream.receive(event(0, { type: 'draft', id: 'answer', text: `Answer ${chunk}` }));
    expect(draftChanged).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(stream.getDraft()).toBe('Answer 499');
    expect(draftChanged).toHaveBeenCalledTimes(1);
    expect(stream.getEvents()).toBe(snapshot);
    expect(eventsChanged).not.toHaveBeenCalled();
  });

  it('preserves every durable event in a burst and publishes history once', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const changed = vi.fn(); stream.subscribeEvents(changed);
    for (let sequence = 1; sequence <= 2_000; sequence++) {
      stream.receive(event(sequence)); stream.receive(event(sequence));
    }
    vi.advanceTimersByTime(40);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(stream.getEvents()).toHaveLength(2_000);
    expect(stream.getEvents().map(item => item.seq)).toEqual(Array.from({ length: 2_000 }, (_, index) => index + 1));
  });

  it('merges delayed disk snapshots without losing pushes or duplicating events', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const pushed = event(2, { type: 'tool', id: 'command', category: 'shell', name: 'run_command', status: 'ok', output: 'Complete' });
    stream.receive(pushed);
    stream.mergeSnapshot('one', [event(1), event(2), event(20, undefined, 'other')]);
    expect(stream.getEvents()).toEqual([event(1), pushed]);
    stream.receive(event(1)); stream.receive(event(3));
    vi.advanceTimersByTime(40);
    expect(stream.getEvents().map(item => item.seq)).toEqual([1, 2, 3]);
  });

  it('orders an out-of-order live event after an already committed snapshot', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    stream.mergeSnapshot('one', [event(4), event(1)]);
    stream.receive(event(3)); stream.receive(event(2)); stream.flush();
    expect(stream.getEvents().map(item => item.seq)).toEqual([1, 2, 3, 4]);
  });

  it('flushes completion immediately and replaces the draft atomically', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    stream.receive(event(0, { type: 'draft', id: 'answer', text: 'Almost complete' })); stream.flush();
    const draftsObserved: (string | null)[] = [];
    stream.subscribeEvents(() => draftsObserved.push(stream.getDraft()));
    stream.receive(event(1, { type: 'final', text: 'Complete' }));
    expect(stream.getEvents()[0].type).toBe('final');
    expect(stream.getDraft()).toBeNull();
    expect(draftsObserved).toEqual([null]);
    vi.advanceTimersByTime(100);
    expect(stream.getDraft()).toBeNull();
  });

  it.each(['cancelled', 'failed', 'interrupted', 'succeeded'] as const)('immediately exposes terminal %s status', status => {
    const stream = new ConversationStream(); stream.selectRun('one');
    stream.receive(event(0, { type: 'draft', id: 'answer', text: 'Draft' }));
    stream.receive(event(1, { type: 'status', status }));
    expect(stream.getEvents()).toEqual([event(1, { type: 'status', status })]);
    expect(stream.getDraft()).toBeNull();
  });

  it('discards pending chunks and delayed snapshots when navigating between Dots', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    stream.receive(event(1));
    stream.receive(event(0, { type: 'draft', id: 'answer', text: 'Previous Dot' }));
    stream.selectRun('two');
    stream.mergeSnapshot('one', [event(2)]); stream.receive(event(3));
    vi.advanceTimersByTime(100);
    expect(stream.getEvents()).toEqual([]); expect(stream.getDraft()).toBeNull();
    stream.receive(event(1, undefined, 'two')); stream.flush();
    expect(stream.getEvents().map(item => item.runId)).toEqual(['two']);
  });

  it('preserves the current stream when selection is unchanged and stops notifying unsubscribed listeners', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const changed = vi.fn(), unsubscribe = stream.subscribeEvents(changed);
    stream.receive(event(1)); stream.flush(); stream.selectRun('one');
    expect(stream.getEvents()).toHaveLength(1);
    unsubscribe(); stream.receive(event(2)); stream.flush();
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('cancels queued publication when the renderer is torn down', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const changed = vi.fn(); stream.subscribeEvents(changed);
    stream.receive(event(1)); stream.dispose(); vi.advanceTimersByTime(100);
    expect(changed).not.toHaveBeenCalled();
  });

  it('retires a rendered draft when a delayed snapshot contains its completed answer', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    stream.receive(event(3, { type: 'status', status: 'running' })); stream.flush();
    stream.receive(event(0, { type: 'draft', id: 'draft-1', text: '**The answer**' })); stream.flush();
    const changed = vi.fn(); stream.subscribeDraft(changed);
    stream.mergeSnapshot('one', [
      event(3, { type: 'status', status: 'running' }),
      event(5, { type: 'message', id: 'draft-1', text: '**The answer**' }),
      event(7, { type: 'final', text: '**The answer**' }),
      event(8, { type: 'status', status: 'succeeded' }),
    ]);
    expect(stream.getDraft()).toBeNull();
    expect(stream.getEvents().at(-1)?.type).toBe('status');
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not publish a pending stale draft after its completion snapshot arrives', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    stream.receive(event(0, { type: 'draft', id: 'draft-1', text: 'Pending answer' }));
    stream.mergeSnapshot('one', [event(7, { type: 'final', text: 'Completed answer' })]);
    vi.advanceTimersByTime(100);
    expect(stream.getDraft()).toBeNull();
    expect(stream.getEvents()).toHaveLength(1);
  });

  it('keeps a newer tool-loop draft when a snapshot only contains the previous completed message', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const previousMessage = event(5, { type: 'message', id: 'draft-1', text: 'Earlier step' });
    stream.receive(previousMessage);
    stream.receive(event(0, { type: 'draft', id: 'draft-2', text: 'Newer step' })); stream.flush();
    stream.mergeSnapshot('one', [previousMessage]);
    expect(stream.getDraft()).toBe('Newer step');
  });

  it('keeps a newer resumed draft after an already observed completion boundary', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const earlierStatus = event(8, { type: 'status', status: 'succeeded' });
    stream.receive(earlierStatus);
    stream.receive(event(9, { type: 'status', status: 'running' }));
    stream.receive(event(0, { type: 'draft', id: 'new-answer', text: 'New live work' })); stream.flush();
    stream.mergeSnapshot('one', [earlierStatus]);
    expect(stream.getDraft()).toBe('New live work');
  });

  it('retires a late draft for a message already present in a snapshot', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const completed = event(5, { type: 'message', id: 'draft-1', text: 'Complete' });
    stream.mergeSnapshot('one', [completed]);
    stream.receive(event(0, { type: 'draft', id: 'draft-1', text: 'Late chunk' })); stream.flush();
    stream.mergeSnapshot('one', [completed]);
    expect(stream.getDraft()).toBeNull();
  });

  it('suppresses queued late drafts and duplicate completion pushes after snapshot completion', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const message = event(5, { type: 'message', id: 'draft-1', text: 'Complete' });
    const final = event(7, { type: 'final', text: 'Complete' });
    const status = event(8, { type: 'status', status: 'succeeded' });
    stream.receive(event(0, { type: 'draft', id: 'draft-1', text: 'Earlier partial' })); stream.flush();
    stream.mergeSnapshot('one', [message, final, status]);
    stream.receive(event(0, { type: 'draft', id: 'draft-1', text: 'Queued late partial' }));
    stream.receive(event(0, { type: 'draft', id: 'unknown-late-id', text: 'Another queued partial' }));
    stream.receive(message); stream.receive(final); stream.receive(status);
    vi.advanceTimersByTime(100);
    expect(stream.getDraft()).toBeNull();
    expect(stream.getEvents()).toEqual([message, final, status]);
  });

  it('keeps a resumed draft even when prior completion pushes and snapshots are duplicated', () => {
    const stream = new ConversationStream(); stream.selectRun('one');
    const message = event(5, { type: 'message', id: 'draft-1', text: 'Earlier completion' });
    const status = event(8, { type: 'status', status: 'succeeded' });
    stream.mergeSnapshot('one', [message, status]);
    stream.receive(event(9, { type: 'status', status: 'running' }));
    stream.receive(event(0, { type: 'draft', id: 'draft-1', text: 'New resumed completion' })); stream.flush();
    stream.receive(message); stream.receive(status);
    stream.mergeSnapshot('one', [message, status]);
    expect(stream.getDraft()).toBe('New resumed completion');
  });
});
