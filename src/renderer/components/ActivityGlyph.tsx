import { FilePenLine, Globe, Terminal, Search, Brain, Plug, Sparkles, Check, AlertCircle, ShieldCheck, Moon, Clock } from 'lucide-react';
import type { ActivityKind } from '@shared/activity';
import '../activity.css';

const icons = { file: FilePenLine, web: Globe, shell: Terminal, search: Search, memory: Brain, mcp: Plug, other: Sparkles, thinking: Sparkles, idle: Sparkles, done: Check, error: AlertCircle, approval: ShieldCheck, paused: Moon, queued: Clock };
export function ActivityGlyph({ kind, active = false }: { kind: ActivityKind; active?: boolean }) {
  const Icon = icons[kind];
  return <span className={`activity-glyph activity-${kind} ${active ? 'is-active' : ''}`} aria-hidden="true"><Icon size={16}/><i/><b/></span>;
}
