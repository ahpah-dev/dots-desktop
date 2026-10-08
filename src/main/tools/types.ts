import type { Permissions, ToolCategory } from '@shared/types';
import type { ApprovalPrompt } from '../providers/types';

export interface ToolContext {
  workspace: string;
  permissions: Permissions;
  signal: AbortSignal;
  requestApproval(prompt: ApprovalPrompt): Promise<boolean>;
  remember(note: string): Promise<void>;
  scheduleFollowup?(prompt: string, dueAt: number): Promise<string>;
  listTeammates?(): Promise<{ id: string; name: string; description: string; busy: boolean }[]>;
  sendDotMessage?(dotId: string, message: string): Promise<string>;
  actionApproved?: boolean;
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/** A capability an agent can invoke. Add new tools by implementing this and registering them. */
export interface Tool {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: JsonSchema;
  /** Short human-readable label of the invocation, shown in the activity feed. */
  describe(args: Record<string, any>): string;
  /** Returns text for the model. Throw to report an error to the model (it can recover). */
  run(args: Record<string, any>, ctx: ToolContext): Promise<string>;
}

export class ToolError extends Error {}

export function str(args: Record<string, any>, key: string, required = true): string {
  const v = args[key];
  if (typeof v === 'string') return v;
  if (required) throw new ToolError(`Missing required string argument "${key}".`);
  return '';
}

export function num(args: Record<string, any>, key: string, fallback: number): number {
  const v = Number(args[key]);
  return Number.isFinite(v) ? v : fallback;
}
