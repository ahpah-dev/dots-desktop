import { activeTool, toolActivity, type DesktopDotState } from '@shared/activity';
import type { AppSettings, DotSummary, Run, RunEvent } from '@shared/types';

export function chooseDesktopDot(dots: DotSummary[], pinnedId?: string): DotSummary | undefined {
  const pinned = dots.find(dot => dot.id === pinnedId);
  if (pinned) return pinned;
  const priority = { 'awaiting-approval': 4, running: 3, queued: 2, idle: 1, paused: 0 };
  return [...dots].sort((a,b) => priority[b.status] - priority[a.status] || (b.lastRunAt ?? b.createdAt) - (a.lastRunAt ?? a.createdAt))[0];
}

export function desktopActivityState(dot: DotSummary | undefined, run: Run | undefined, events: RunEvent[], settings: AppSettings, dotCount: number, pinned: boolean, dark: boolean): DesktopDotState {
  let activity: DesktopDotState['activity'] = 'idle';
  let caption = "I'm here whenever you need me.";
  if (!dot) caption = 'Open Dots to meet your first teammate.';
  else if (dot.paused) { activity = 'paused'; caption = "I'm taking a pause. Your work is safe."; }
  else if (dot.status === 'awaiting-approval') { activity = 'approval'; caption = 'I need your approval before I continue.'; }
  else if (run?.status === 'queued') { activity = 'queued'; caption = "I'm queued up and ready for my turn."; }
  else if (run?.status === 'running') {
    const tool = activeTool(events);
    const next = tool ? toolActivity(tool) : { kind: 'thinking' as const, caption: "I'm thinking through the next step." };
    activity = next.kind; caption = next.caption;
  } else if (run?.status === 'succeeded') { activity = 'done'; caption = 'All done! Your results are ready to review.'; }
  else if (run?.status === 'failed' || run?.status === 'interrupted') { activity = 'error'; caption = 'This task needs another look. Open Dots to review it.'; }
  else if (run?.status === 'cancelled') { activity = 'paused'; caption = "I've stopped this task."; }
  return {
    visible: false,
    dot: dot ? { id: dot.id, name: dot.name, color: dot.color, avatar: dot.avatar, status: dot.status, paused: dot.paused } : null,
    runId: run?.id, taskTitle: (run?.title ?? '').slice(0,100), activity, caption,
    canStop: !!run && (run.status === 'running' || run.status === 'queued'), dotCount, pinned,
    voice: settings.desktopDotVoice, theme: dark ? 'dark' : 'light'
  };
}

export function clampDesktopBounds(bounds: { x: number; y: number; width: number; height: number }, area: { x: number; y: number; width: number; height: number }) {
  const width = Math.min(bounds.width, area.width), height = Math.min(bounds.height, area.height);
  return { width, height, x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)), y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)) };
}
