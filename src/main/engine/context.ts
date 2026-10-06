import type { Dot, DotTask, Followup, Run } from '@shared/types';

const MAX_MEMORY_CHARS = 12_000;

export interface ContextInput {
  dot: Dot;
  memory: string;
  recentRuns: Run[];
  trigger: Run['trigger'];
  tasks?: DotTask[];
  followups?: Followup[];
  now?: Date;
}

function describePermissions(dot: Dot): string {
  const p = dot.permissions;
  const parts = [
    p.files === 'write' ? 'read and write files in your workspace' : 'read-only access to your workspace files',
    p.shell ? 'may run shell commands' : 'may NOT run shell commands',
    p.web ? 'may browse and search the web' : 'has NO web/network access',
    p.outsideWorkspace ? 'may access files outside the workspace' : 'must stay inside the workspace'
  ];
  return parts.join('; ');
}

/** Builds the standing context given to the agent on every run: who it is, what it remembers, what it did recently. */
export function buildContext({ dot, memory, recentRuns, trigger, tasks = [], followups = [], now = new Date() }: ContextInput): string {
  const mem = memory.trim();
  const memText = mem.length > MAX_MEMORY_CHARS ? `…(older memory omitted)\n${mem.slice(-MAX_MEMORY_CHARS)}` : mem;

  const history = recentRuns
    .filter((r) => r.status === 'succeeded' || r.status === 'failed')
    .slice(0, 6)
    .map((r) => {
      const when = new Date(r.endedAt ?? r.createdAt).toLocaleString();
      const result = (r.finalMessage ?? r.error ?? '').replace(/\s+/g, ' ').trim().slice(0, 220);
      return `- [${when}] ${r.status}: "${r.title}"${result ? ` → ${result}` : ''}`;
    });

  const sections = [
    `# You are "${dot.name}"`,
    `You are a persistent, autonomous AI agent (a "Dot") running inside the Dots desktop app.${dot.description ? ` ${dot.description}` : ''}`,
    `## Standing instructions\n${dot.instructions.trim() || '(none — use good judgement)'}`,
    `## Memory (persists across tasks)\n${memText || '(empty — nothing remembered yet)'}`,
    tasks.some((t) => t.status === 'active') ? `## Ongoing responsibilities\n${tasks.filter((t) => t.status === 'active').slice(0, 20).map((t) => `- ${t.title}: ${t.prompt.slice(0, 1000)}${t.nextRunAt ? ` (next: ${new Date(t.nextRunAt).toISOString()})` : ''}`).join('\n')}` : '',
    followups.some((f) => f.status === 'pending') ? `## Already scheduled wakeups\n${followups.filter((f) => f.status === 'pending').slice(0, 20).map((f) => `- ${new Date(f.dueAt).toISOString()}: ${f.prompt.slice(0, 500)}`).join('\n')}\nAvoid scheduling duplicate wakeups.` : '',
    dot.permissions.rules?.length ? `## Custom action rules\n${dot.permissions.rules.map((r) => `- ${r.effect.toUpperCase()} ${r.action}${r.pattern ? ` when arguments contain "${r.pattern}"` : ''}`).join('\n')}` : '',
    history.length ? `## Recent task history (newest first)\n${history.join('\n')}` : '',
    [
      '## Environment',
      `- Current time: ${now.toString()}`,
      `- Operating system: ${process.platform}`,
      `- Your workspace (working directory): ${dot.workspacePath}`,
      `- Permissions: ${describePermissions(dot)}`,
      `- This task was started ${trigger === 'schedule' ? 'by your schedule' : trigger === 'followup' ? 'by a persistent wakeup' : 'by the user'}.`
    ].join('\n'),
    [
      '## Rules',
      '- Work independently and finish the task. Don\'t ask clarifying questions mid-run; make sensible assumptions and state them. If you are truly blocked, say exactly what you need in your final message.',
      '- Stay within your permissions. Never reveal or store secrets, API keys or passwords.',
      '- Finish with a clear, concise report of what you did, what you found and anything needing the user\'s attention.',
      '- To remember something durable for future tasks (preferences, conventions, decisions, state of ongoing work), end your final message with a block:',
      '  <memory_update>',
      '  - one concise fact per line',
      '  </memory_update>',
      '  Only include genuinely useful, non-secret facts. Omit the block if there is nothing worth remembering.'
    ].join('\n'),
    [
      '## Persistent wakeups',
      '- When the task genuinely requires checking back later, schedule a one-time wakeup with the schedule_followup tool if available.',
      '- If that tool is unavailable, append <followup due="2026-10-07T09:00:00+02:00">A specific instruction for the next check.</followup> to your final message, using an actual future ISO 8601 time with a timezone.',
      '- A wakeup continues this conversation, uses the same permissions and budget, and runs only while the app is running. Do not duplicate a wakeup already scheduled with a tool or already listed above.',
      '- Do not schedule speculative, unnecessary, or endless checks. Explain useful scheduled followups in your report.'
    ].join('\n')
  ];
  return sections.filter(Boolean).join('\n\n');
}

const MEMORY_BLOCK = /<memory_update>([\s\S]*?)<\/memory_update>/gi;

/** Split an agent's final message into its visible text and any memory notes it asked to save. */
export function extractMemoryUpdates(text: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const cleaned = text.replace(MEMORY_BLOCK, (_m, body: string) => {
    for (const line of body.split('\n')) {
      const t = line.replace(/^\s*[-*•]\s*/, '').trim();
      if (t) notes.push(t);
    }
    return '';
  });
  return { text: cleaned.trim(), notes };
}

/** Codex CLI cannot call host tools, so it requests durable wakeups through a bounded final block. */
export function extractFollowups(text: string): { text: string; followups: { prompt: string; dueAt: number }[] } {
  const followups: { prompt: string; dueAt: number }[] = [];
  const cleaned = text.replace(/<followup\s+due=["']([^"']+)["']\s*>([\s\S]*?)<\/followup>/gi, (block, due: string, body: string) => {
    const dueAt = Date.parse(due);
    const prompt = body.trim();
    if (!Number.isFinite(dueAt) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(due) || !prompt || followups.length >= 5) return block;
    followups.push({ prompt, dueAt });
    return '';
  });
  return { text: cleaned.trim(), followups };
}
