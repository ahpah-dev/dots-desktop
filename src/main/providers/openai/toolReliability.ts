import { randomUUID } from 'node:crypto';
import { normalize, resolve } from 'node:path';
import type { Tool } from '../../tools/types';
import type { ToolCall, ChatMessage } from './chat';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Only punctuation outside JSON strings is repaired. Never invent a missing value or closing quote. */
function withoutTrailingCommas(text: string): string {
  let quoted = false, escaped = false, out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!quoted && char === ',' && /^[\s]*[}\]]/.test(text.slice(i + 1))) continue;
    out += char;
    if (escaped) escaped = false;
    else if (quoted && char === '\\') escaped = true;
    else if (char === '"') quoted = !quoted;
  }
  return out;
}

export function parseToolArguments(text: string, tool: Tool): { args: Record<string, unknown>; repaired: boolean } {
  let source = text.trim() || '{}';
  const original = source;
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(source);
  if (fence) source = fence[1].trim();
  let value: unknown;
  try { value = JSON.parse(source); }
  catch {
    try { source = withoutTrailingCommas(source); value = JSON.parse(source); }
    catch { throw new Error('Arguments must be a complete JSON object. Retry with correct JSON; for large files write smaller chunks, then append:true. No incomplete arguments were executed.'); }
  }
  if (typeof value === 'string') {
    try { value = JSON.parse(value); source = JSON.stringify(value); }
    catch { throw new Error('Arguments were a string, not a JSON object.'); }
  }
  if (!object(value)) throw new Error('Arguments must be an object, not null, an array or a primitive.');
  const required = new Set(tool.parameters.required ?? []);
  for (const key of required) if (!Object.hasOwn(value, key)) throw new Error(`Missing required argument "${key}" for ${tool.name}.`);
  for (const [key, input] of Object.entries(value)) {
    const schema = Object.hasOwn(tool.parameters.properties, key) ? tool.parameters.properties[key] as Record<string, unknown> : undefined;
    // Unknown parameters usually indicate a misspelled path/content key. Do not silently discard them.
    if (!schema) throw new Error(`Unknown argument "${key}" for ${tool.name}. Allowed: ${Object.keys(tool.parameters.properties).join(', ') || '(none)'}.`);
    if (input === null && !required.has(key)) { delete value[key]; continue; }
    if (typeof input !== schema.type || (schema.type === 'number' && !Number.isFinite(input))) throw new Error(`Argument "${key}" must be ${schema.type} for ${tool.name}.`);
    if (typeof schema.maxLength === 'number' && typeof input === 'string' && input.length > schema.maxLength) throw new Error(`Argument "${key}" exceeds ${schema.maxLength} characters.`);
  }
  return { args: value, repaired: source !== original };
}

/** Normalizes router quirks without guessing tool names or their argument values. */
export function normalizeToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) throw new Error('tool_calls must be an array.');
  const ids = new Set<string>();
  return raw.map(call => {
    if (!object(call) || !object(call.function) || typeof call.function.name !== 'string') throw new Error('A tool call is missing its function name.');
    const args = call.function.arguments;
    if (args !== undefined && typeof args !== 'string' && !object(args)) throw new Error('A tool call has invalid arguments.');
    let id = typeof call.id === 'string' && call.id.trim() ? call.id : `call_${randomUUID()}`;
    if (ids.has(id)) id = `call_${randomUUID()}`;
    ids.add(id);
    return { id, type: 'function', function: { name: call.function.name.trim(), arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) } };
  });
}

/** A complete, explicit envelope only. Prose, examples and truncated code are never extracted. */
export function parseToolEnvelope(text: string): { calls: ToolCall[]; final?: string } {
  let value: unknown;
  try { value = JSON.parse(text.trim()); } catch { throw new Error('Respond with one complete JSON tool_calls or final envelope, with no markdown or extra prose.'); }
  if (!object(value)) throw new Error('The response must be a JSON object.');
  if (Object.keys(value).length === 1 && typeof value.final === 'string' && value.final.trim()) return { calls: [], final: value.final };
  if (Object.keys(value).length !== 1 || !Array.isArray(value.tool_calls) || !value.tool_calls.length) throw new Error('Use exactly {"tool_calls":[{"name":"tool_name","arguments":{...}}]} or {"final":"your answer"}.');
  return { calls: normalizeToolCalls(value.tool_calls.map(call => {
    if (!object(call) || typeof call.name !== 'string' || !object(call.arguments) || Object.keys(call).some(key => !['name', 'arguments', 'id'].includes(key))) throw new Error('Each call needs name and an arguments object.');
    return { id: call.id, function: { name: call.name, arguments: call.arguments } };
  })) };
}

export function envelopeInstructions(tools: Tool[]): string {
  return `## JSON tool transport\nThis endpoint does not use native function calling for this turn. Return ONLY one JSON object, with no markdown. To take an action use {"tool_calls":[{"name":"write_file","arguments":{"path":"example.txt","content":"example"}}]}. This example is syntax, not a requested action. After reading real results, use {"final":"your answer"} when finished. Never invent a tool result. All permissions still apply. Available tools:\n${JSON.stringify(tools.map(tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters })))}`;
}

/** Convert native history when a router refuses the protocol; keep every receipt and the user request. */
export function envelopeHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages.map(message => {
    if (message.role === 'tool') return { role: 'user', content: `Actual Dots tool result (${message.tool_call_id}):\n${message.content}` };
    if (message.tool_calls) return { role: 'assistant', content: JSON.stringify({ tool_calls: message.tool_calls.map(call => {
      let argumentsValue: unknown = call.function.arguments;
      try { argumentsValue = JSON.parse(call.function.arguments); } catch { /* retain the rejected input for recovery */ }
      return { name: call.function.name, arguments: argumentsValue };
    }) }) };
    return message;
  });
}

export function rejectsNativeTools(message: string): boolean {
  return /\((400|422)\)/.test(message) && /(?:tool|function)[_ -]?(?:calling|calls|choice|s)?/i.test(message) && /unsupported|not supported|does not support|not allowed|unknown (?:parameter|field)|unrecognized|invalid (?:parameter|field)/i.test(message);
}

type Requirement = 'write' | 'command' | 'web' | 'read' | 'memory' | 'message' | 'schedule';
const actions: Record<Requirement, string[]> = {
  write: ['write_file', 'edit_file'], command: ['run_command'], web: ['web_search', 'web_fetch', 'browse_page'],
  read: ['read_file', 'search_files', 'list_files', 'run_command'], memory: ['remember'], message: ['send_dot_message'], schedule: ['schedule_followup'],
};

/** Conservative evidence checks, not a claim to understand or verify arbitrary task semantics. */
export class ToolEvidence {
  revision = 0;
  private required = new Set<Requirement>();
  private completed = new Set<Requirement>();
  private unverified = new Set<string>();
  private latestError = '';
  private blocked = '';
  private failed = new Map<string, string>();
  private protocolError = '';

  constructor(prompt: string, private workspace: string, synthesis = false) {
    if (synthesis) return;
    // Ignore examples/quoted material, and leave explanation-only or explicitly non-action tasks alone.
    const task = prompt.replace(/```[\s\S]*?```/g, '').replace(/"[^"\n]*"|'[^'\n]*'/g, '').split(/\n\n(?:Workspace file references|Project task)/)[0];
    if (/^\s*(?:explain|describe|what\b|why\b|how\b|show (?:me )?(?:an? )?example|(?:do not|don't|never)\b)/i.test(task)) return;
    if (/\b(?:write|create|save|edit|update|modify|fix|build|implement|improve|polish|change|make)\b/i.test(task) && (/\b(?:file|files|app|website|project|code|button)\b|[\w-]+\.(?:txt|md|html|css|[cm]?[jt]sx?|json|py|csv|ya?ml)\b/i.test(task) || /Project task \((?:build|fix|polish)\)/.test(prompt))) this.required.add('write');
    if (/\b(?:run|execute)\b[^.!?\n]*(?:\b(?:command|tests?|checks?|script|build)\b|`[^`]+`)|\b(?:test|verify)\b[^.!?\n]*\b(?:tests?|suite|build)\b/i.test(task)) this.required.add('command');
    if (/\b(?:search|browse|look up|fetch)\b[^.!?\n]*\b(?:web|online|internet|https?)\b/i.test(task)) this.required.add('web');
    if (/\b(?:read|inspect|search|list)\b[^.!?\n]*\b(?:file|files|workspace|directory|folders?)\b/i.test(task)) this.required.add('read');
    if (/\b(?:remember|save (?:this|it) to memory)\b/i.test(task)) this.required.add('memory');
    if (/\b(?:send|message|ask)\b[^.!?\n]*\b(?:dot|dots|teammate)\b/i.test(task)) this.required.add('message');
    if (/\b(?:schedule|remind me|check back)\b/i.test(task)) this.required.add('schedule');
  }

  record(name: string, args: Record<string, unknown>, error?: string, protocol = false): void {
    const subject = String(args.path ?? args.command ?? args.url ?? args.query ?? args.dot_id ?? '');
    const key = `${name}:${subject}`;
    if (error) {
      this.latestError = error;
      if (/declined|denied|blocked by|not permitted|read-only/i.test(error)) this.blocked = error;
      else if (protocol) this.protocolError = error;
      else this.failed.set(key, error);
      return;
    }
    this.failed.delete(key);
    this.protocolError = '';
    this.latestError = [...this.failed.values()].at(-1) ?? '';
    for (const [requirement, names] of Object.entries(actions)) if (names.includes(name)) {
      if (!this.completed.has(requirement as Requirement) && this.required.has(requirement as Requirement)) this.revision++;
      this.completed.add(requirement as Requirement);
    }
    if (name === 'write_file' || name === 'edit_file') { this.unverified.add(this.path(args.path)); this.revision++; }
    if (name === 'read_file' && this.unverified.delete(this.path(args.path))) this.revision++;
    // A successful command is evidence of a check, not proof of every possible app behavior.
    if (name === 'run_command' && this.unverified.size) { this.unverified.clear(); this.revision++; }
  }

  private path(path: unknown): string {
    const value = normalize(resolve(this.workspace, String(path))).replace(/\\/g, '/');
    return process.platform === 'win32' ? value.toLowerCase() : value;
  }

  checkpoint(): string {
    return `## Execution evidence\nCompleted action types: ${[...this.completed].join(', ') || 'none'}. ${this.unverified.size ? `Files changed since the last read/check: ${[...this.unverified].join(', ')}.` : ''} ${this.latestError ? `Most recent tool failure: ${this.latestError}. Correct it or report it honestly; do not repeat successful side effects.` : ''} ${this.blocked ? `Permission blocked an action: ${this.blocked}. Do not retry it or bypass it with another tool.` : ''}`;
  }

  missing(): string | undefined {
    if (this.blocked) return undefined;
    const missing = [...this.required].filter(requirement => !this.completed.has(requirement));
    if (missing.length) return `The requested ${missing.join(', ')} action has no successful tool evidence. Use an available permitted tool to do the actual work; a plan or a claim of completion is not execution.`;
    if (this.unverified.size) return 'Read the changed files or run an appropriate check before claiming verification. Do not rewrite or append the successful work again.';
    return undefined;
  }

  failureNote(): string | undefined {
    return this.blocked || this.protocolError || (this.failed.size ? [...this.failed.values()].join('\n').slice(0, 1000) : undefined);
  }
}
