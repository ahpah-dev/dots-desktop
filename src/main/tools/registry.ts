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

/** Every tool that exists. Register new tools here. */
export const ALL_TOOLS: Tool[] = [
  listFiles, readFile, searchFiles, writeFile, editFile, runCommand, webSearch, webFetch, browsePage, rememberTool
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
