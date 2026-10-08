import { str, ToolError, type Tool } from './types';

export const listDotsTool: Tool = {
  name: 'list_dots', category: 'other',
  description: 'Find teammates that have enabled talking to other Dots. Returns their IDs, names, descriptions and whether they are busy. Does not expose private instructions, memory or files.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  describe: () => 'Find available teammates',
  async run(_args, ctx) {
    if (!ctx.permissions.talkToDots || !ctx.listTeammates) throw new ToolError('Talking to other Dots is disabled.');
    return JSON.stringify(await ctx.listTeammates());
  }
};

export const sendDotMessageTool: Tool = {
  name: 'send_dot_message', category: 'other',
  description: 'Send a specific request to an enabled teammate, using its ID from list_dots. The teammate runs with its own permissions and budget. Returns a queued delivery confirmation, not its answer. Its final answer will arrive automatically as a later turn in this conversation. Continue your own work without waiting or polling. Up to 3 requests per run, 8 per exchange and 4 message hops.',
  parameters: { type: 'object', properties: { dot_id: { type: 'string' }, message: { type: 'string', maxLength: 8000 } }, required: ['dot_id', 'message'], additionalProperties: false },
  describe: args => `Message teammate: ${String(args.message ?? '').slice(0, 100)}`,
  async run(args, ctx) {
    if (!ctx.permissions.talkToDots || !ctx.sendDotMessage) throw new ToolError('Talking to other Dots is disabled.');
    if (ctx.signal.aborted) throw new ToolError('This task was cancelled.');
    return ctx.sendDotMessage(str(args, 'dot_id'), str(args, 'message'));
  }
};
