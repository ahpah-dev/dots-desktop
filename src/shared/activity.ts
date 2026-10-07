import type { DotAvatarConfig, DotStatus, RunEvent, ToolCategory } from './types';

export type ActivityKind = ToolCategory | 'thinking' | 'idle' | 'done' | 'error' | 'approval' | 'paused' | 'queued';
export type ToolEvent = Extract<RunEvent, { type: 'tool' }>;

export function toolActivity(tool: Pick<ToolEvent, 'name' | 'category'>): { kind: ActivityKind; label: string; caption: string } {
  const name = tool.name.toLowerCase();
  if (/web.?search/.test(name)) return { kind: 'web', label: 'Searching the web', caption: "I'm searching the web for you." };
  if (tool.category === 'file') {
    const reading = /read|list/.test(name);
    return { kind: 'file', label: reading ? 'Reading files' : 'Writing files', caption: reading ? "I'm reading your workspace files." : "I'm updating the files in your workspace." };
  }
  const labels: Record<ToolCategory, [string, string]> = {
    shell: ['Running a command', "I'm running a command and checking its result."],
    web: ['Exploring the web', "I'm exploring the web for you."],
    search: ['Searching', "I'm searching for the details we need."],
    memory: ['Remembering', "I'm saving something useful to remember."],
    mcp: ['Using a connected tool', "I'm working with a connected tool."],
    other: ['Working on the next step', "I'm working through the next step."],
    file: ['Working with files', "I'm working with your files."]
  };
  const [label, caption] = labels[tool.category];
  return { kind: tool.category, label, caption };
}

export function activeTool(events: RunEvent[]): ToolEvent | undefined {
  const seen = new Set<string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type !== 'tool' || seen.has(event.id)) continue;
    seen.add(event.id);
    if (event.status === 'running') return event;
  }
  return undefined;
}

export interface DesktopDotState {
  visible: boolean;
  dot: { id: string; name: string; color: string; avatar?: DotAvatarConfig; status: DotStatus; paused: boolean } | null;
  runId?: string;
  taskTitle: string;
  activity: ActivityKind;
  caption: string;
  canStop: boolean;
  dotCount: number;
  pinned: boolean;
  voice: boolean;
  theme: 'light' | 'dark';
}

export type DesktopDotAction = 'open' | 'stop' | 'hide' | 'next' | 'auto' | 'toggle-voice';
export const DESKTOP_DOT_STATE_CHANNEL = 'desktop-dot:state';
export const DESKTOP_DOT_GET_CHANNEL = 'desktop-dot:get';
export const DESKTOP_DOT_CONTROL_CHANNEL = 'desktop-dot:control';
export interface DesktopDotBridge {
  getState(): Promise<DesktopDotState>;
  control(action: DesktopDotAction, runId?: string): Promise<void>;
  onState(listener: (state: DesktopDotState) => void): () => void;
}
