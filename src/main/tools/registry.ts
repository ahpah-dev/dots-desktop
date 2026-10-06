import type { Permissions } from '@shared/types';
import { editFile, listFiles, readFile, searchFiles, writeFile } from './files';
import { runCommand } from './shell';
import { browsePage, webFetch, webSearch } from './web';
import { ToolError, str, type Tool } from './types';

export const rememberTool: Tool = {
  name: 'remember',
  description: 'Save a durable fact to your long-term memory so you can recall it in future tasks (preferences, conventions, decisions, state of ongoing work). Never save secrets.',
  category: 'memory',
  parameters: { type: 'object', properties: { note: { type: 'string', description: 'One concise fact.' } }, required: ['note'] },
  describe: (a) => String(a.note ?? '').slice(0, 120),
  async run(args, ctx) {
    const note = str(args, 'note').trim();
    if (!note) throw new ToolError('Empty note.');
    await ctx.remember(note);
    return 'Saved to memory.';
  }
};

export const scheduleFollowupTool: Tool = {
  name: 'schedule_followup',
  description: 'Schedule a persistent one-time wakeup to continue this conversation at a future ISO 8601 time with a timezone. Runs while Dots is open or in the tray; overdue wakeups run once on the next launch. Use only when checking back is part of the task.',
  category: 'other',
  parameters: { type: 'object', properties: { prompt: { type: 'string' }, due_at: { type: 'string', description: 'Future ISO 8601 timestamp, for example 2026-10-07T09:00:00+02:00.' } }, required: ['prompt', 'due_at'] },
  describe: (a) => `Wake up ${a.due_at}: ${String(a.prompt ?? '').slice(0, 100)}`,
  async run(args, ctx) {
    if (!ctx.scheduleFollowup) throw new ToolError('Persistent wakeups are unavailable.');
    const due = str(args, 'due_at');
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(due)) throw new ToolError('Include a timezone in due_at.');
    const dueAt = Date.parse(due);
    if (!Number.isFinite(dueAt) || dueAt <= Date.now()) throw new ToolError('Choose a valid future time.');
    const id = await ctx.scheduleFollowup(str(args, 'prompt'), dueAt);
    return `Wakeup ${id} saved for ${new Date(dueAt).toISOString()}.`;
  }
};

/** Every tool that exists. Register new tools here. */
export const ALL_TOOLS: Tool[] = [
  listFiles, readFile, searchFiles, writeFile, editFile, runCommand, webSearch, webFetch, browsePage, rememberTool, scheduleFollowupTool
];

/** Select the tools a Dot is allowed to use, based on its permissions. */
export function toolsFor(p: Permissions): Tool[] {
  return ALL_TOOLS.filter((t) => {
    switch (t.name) {
      case 'write_file':
      case 'edit_file':
        return p.files === 'write';
      case 'run_command':
        return p.shell;
      case 'web_search':
      case 'web_fetch':
      case 'browse_page':
        return p.web;
      default:
        return true;
    }
  });
}
