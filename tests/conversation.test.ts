import { describe, expect, it } from 'vitest';
import { consolidateConversationEvents, earlierConversationTurns, summarizeConversations } from '../src/shared/conversation';
import type { Run, RunEvent } from '../src/shared/types';

const run = (id: string, createdAt: number, patch: Partial<Run> = {}): Run => ({ id, createdAt, dotId: 'dot', trigger: 'manual', title: `Request ${id}`, prompt: `Prompt ${id}`, newSession: false, conversationId: 'conversation', status: 'succeeded', ...patch });
const event = (seq: number, body: Record<string, unknown>): RunEvent => ({ seq, runId: 'run', dotId: 'dot', ts: seq, ...body } as RunEvent);

describe('conversation history', () => {
  it('uses a stable opening title, searches every turn, and opens the latest turn even with unordered updates', () => {
    const summaries = summarizeConversations([run('middle', 20), run('first', 10, { title: 'Build a garden planner', prompt: 'Help with seedlings' }), run('last', 30, { prompt: 'Remember the greenhouse', status: 'failed' }), run('other', 40, { conversationId: 'other' })]);
    expect(summaries.map(summary => summary.id)).toEqual(['other', 'conversation']);
    expect(summaries[1]).toMatchObject({ title: 'Build a garden planner', turns: 3, latest: { id: 'last', status: 'failed' } });
    expect(summaries[1].searchText).toContain('seedlings');
    expect(summaries[1].searchText).toContain('greenhouse');
  });
  it('keeps legacy standalone runs separate instead of merging missing conversation ids', () => {
    expect(summarizeConversations([run('a', 1, { conversationId: undefined }), run('b', 2, { conversationId: undefined })]).map(summary => summary.id)).toEqual(['b', 'a']);
  });
  it('includes branch ancestors without showing future turns or another conversation', () => {
    const selected = run('branch', 40, { conversationId: 'branch', prefixRunIds: ['first', 'second'] });
    const turns = earlierConversationTurns([run('future', 50, { conversationId: 'branch' }), run('other', 1, { conversationId: 'other' }), selected, run('second', 20), run('first', 10), run('branch-previous', 30, { conversationId: 'branch' })], selected);
    expect(turns.map(turn => turn.id)).toEqual(['first', 'second', 'branch-previous']);
  });
  it('keeps the original legacy message when continuing it into a new conversation id', () => {
    const original = run('legacy', 1, { conversationId: undefined });
    const next = run('next', 2, { conversationId: 'legacy-dot', parentRunId: 'legacy' });
    const selected = run('current', 3, { conversationId: 'legacy-dot', parentRunId: 'next' });
    expect(earlierConversationTurns([original, next, selected], selected).map(turn => turn.id)).toEqual(['legacy', 'next']);
  });
});

describe('conversation event consolidation', () => {
  it('replaces progress states with actual tool results without moving tools past subsequent messages', () => {
    const events = [event(1, { type: 'tool', id: 'tool', name: 'run_command', category: 'shell', status: 'running' }), event(2, { type: 'message', id: 'message', text: 'Checking the command' }), event(3, { type: 'tool', id: 'tool', name: 'run_command', category: 'shell', status: 'error', output: 'Real command failure' })];
    expect(consolidateConversationEvents(events).map(item => item.seq)).toEqual([3, 2]);
    expect(consolidateConversationEvents(events)[0]).toMatchObject({ status: 'error', output: 'Real command failure' });
  });
  it('shows a final answer once and retains distinct commentary', () => {
    expect(consolidateConversationEvents([event(1, { type: 'message', id: 'a', text: 'Progress' }), event(2, { type: 'message', id: 'b', text: 'Done' }), event(3, { type: 'final', text: 'Done' })]).map(item => item.seq)).toEqual([1, 3]);
  });
});
