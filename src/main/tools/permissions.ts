import type { Permissions, PermissionRule } from '@shared/types';
import { ToolError, type Tool, type ToolContext } from './types';

/** Explicit deny wins; a narrow allow can override the default approval policy, never capability toggles. */
export function matchingRule(permissions: Permissions, action: string, args: Record<string, unknown>): PermissionRule | undefined {
  const argumentText = Object.values(args).map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join('\n').toLowerCase();
  const matching = (permissions.rules ?? []).filter((rule) =>
    (rule.action === '*' || rule.action === action) && (!rule.pattern || argumentText.includes(rule.pattern.toLowerCase()))
  );
  return matching.find((rule) => rule.effect === 'deny') ?? matching.find((rule) => rule.effect === 'ask') ?? matching.find((rule) => rule.effect === 'allow');
}

export async function authorizeTool(tool: Tool, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolContext> {
  const rule = matchingRule(ctx.permissions, tool.name, args);
  if (rule?.effect === 'deny') throw new ToolError(`Blocked by the custom permission rule for ${tool.name}.`);
  if (rule?.effect === 'ask') {
    const approved = await ctx.requestApproval({ kind: tool.category === 'shell' ? 'shell' : tool.category === 'file' ? 'write' : 'other', summary: tool.describe(args), detail: JSON.stringify(args, null, 2).slice(0, 3000) });
    if (!approved) throw new ToolError('The user declined this action.');
  }
  // Avoid requesting the same approval twice inside the shell/file tool. Read-only shell remains guarded.
  return rule ? { ...ctx, actionApproved: rule.effect === 'ask', permissions: { ...ctx.permissions, approval: 'never' } } : ctx;
}
