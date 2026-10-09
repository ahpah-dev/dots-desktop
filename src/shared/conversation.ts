import type { Run, RunEvent } from './types';

/** A tool's final state replaces its progress events without moving its place. */
export function consolidateConversationEvents(events: RunEvent[]): RunEvent[] {
  const result: RunEvent[] = [];
  const toolIndices = new Map<string, number>();
  const finalTexts = new Set(events.filter(event => event.type === 'final').map(event => event.text));
  for (const event of events) {
    if (event.type === 'message' && finalTexts.has(event.text)) continue;
    if (event.type === 'tool') {
      const index = toolIndices.get(event.id);
      if (index !== undefined) result[index] = event;
      else { toolIndices.set(event.id, result.length); result.push(event); }
    } else result.push(event);
  }
  return result;
}

export interface ConversationSummary {
  id: string;
  latest: Run;
  title: string;
  turns: number;
  searchText: string;
}

/** Search every user turn, while opening the latest turn of the conversation. */
export function summarizeConversations(runs: Run[]): ConversationSummary[] {
  const summaries = new Map<string, ConversationSummary>();
  const firstAt = new Map<string, number>();
  for (const run of runs) {
    const id = run.conversationId || run.id;
    const current = summaries.get(id);
    if (!current) {
      summaries.set(id, { id, latest: run, title: run.title, turns: 1, searchText: `${run.title}\n${run.prompt}`.toLowerCase() });
      firstAt.set(id, run.createdAt);
    } else {
      current.turns += 1;
      current.searchText += `\n${run.title}\n${run.prompt}`.toLowerCase();
      if (run.createdAt > current.latest.createdAt) current.latest = run;
      // The first user request gives a conversation a stable, recognizable name.
      if (run.createdAt < firstAt.get(id)!) { current.title = run.title; firstAt.set(id, run.createdAt); }
    }
  }
  return [...summaries.values()].sort((a, b) => b.latest.createdAt - a.latest.createdAt);
}

export function earlierConversationTurns(runs: Run[], selected: Run | null): Run[] {
  if (!selected?.conversationId) return [];
  const inherited = new Set(selected.prefixRunIds);
  const byId = new Map(runs.map(run => [run.id, run]));
  let parentId = selected.parentRunId;
  while (parentId && !inherited.has(parentId)) {
    inherited.add(parentId);
    parentId = byId.get(parentId)?.parentRunId;
  }
  return runs.filter(run => run.id !== selected.id && run.createdAt <= selected.createdAt && (run.conversationId === selected.conversationId || inherited.has(run.id))).sort((a, b) => a.createdAt - b.createdAt);
}
