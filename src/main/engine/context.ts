import type { Dot, Run } from '@shared/types';

const MAX_MEMORY_CHARS = 12_000;

export interface ContextInput {
  dot: Dot;
  memory: string;
  recentRuns: Run[];
  trigger: Run['trigger'];
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
export function buildContext({ dot, memory, recentRuns, trigger, now = new Date() }: ContextInput): string {
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
    history.length ? `## Recent task history (newest first)\n${history.join('\n')}` : '',
    [
      '## Environment',
      `- Current time: ${now.toString()}`,
      `- Operating system: ${process.platform}`,
      `- Your workspace (working directory): ${dot.workspacePath}`,
      `- Permissions: ${describePermissions(dot)}`,
      `- This task was started ${trigger === 'schedule' ? 'by your schedule (no one is watching)' : 'by the user'}.`
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
