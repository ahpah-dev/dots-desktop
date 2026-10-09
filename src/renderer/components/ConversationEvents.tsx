import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Brain, Check, CheckCircle2, ChevronDown, ChevronRight, Clock, Copy, FileCode, Volume2, XCircle } from 'lucide-react';
import type { DotSummary, RunEvent, RunStatus } from '@shared/types';
import { consolidateConversationEvents } from '@shared/conversation';
import { toolActivity } from '@shared/activity';
import { DotAvatar } from './DotAvatar';
import { ActivityGlyph } from './ActivityGlyph';

export const TOOL_LABELS: Record<string, string> = {
  run_command: 'Running a command', read_file: 'Reading a file', write_file: 'Writing a file', edit_file: 'Editing a file',
  search_files: 'Searching files', web_search: 'Searching the web', web_fetch: 'Reading a webpage', remember: 'Remembering this',
  schedule_followup: 'Scheduling a follow-up', list_dots: 'Finding teammates', send_dot_message: 'Messaging a teammate',
};

const MARKDOWN_PLUGINS = [remarkGfm];
const transformUrl = (url: string) => /^(https?:|file:|[a-z]:[\\/]|\/|\.|#)/i.test(url) || !url.includes(':') ? url : '';

/** Historical Markdown stays parsed while new tokens arrive or a composer changes. */
export const ConversationMarkdown = memo(function ConversationMarkdown({ text, onOpenLink }: { text: string; onOpenLink: (href: string) => void }) {
  const components = useMemo(() => ({
    a: ({ href, children }: React.ComponentProps<'a'>) => <a href={href} onClick={event => { event.preventDefault(); if (href) onOpenLink(href); }}>{children}</a>,
  }), [onOpenLink]);
  return <ReactMarkdown remarkPlugins={MARKDOWN_PLUGINS} urlTransform={transformUrl} components={components}>{text}</ReactMarkdown>;
});

interface EventListProps {
  events: RunEvent[];
  status: RunStatus;
  dot: DotSummary | null;
  onOpenLink: (href: string) => void;
  onFollowup: () => void;
  onError: (message: string) => void;
}

/** Tool expansion and copy feedback belong to this turn, not the entire chat. */
export const ConversationEvents = memo(function ConversationEvents({ events, status, dot, onOpenLink, onFollowup, onError }: EventListProps) {
  const consolidated = useMemo(() => consolidateConversationEvents(events), [events]);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [copied, setCopied] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState<number | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  useEffect(() => () => {
    clearTimeout(copyTimer.current);
    if (utteranceRef.current) window.speechSynthesis?.cancel();
  }, []);
  const copy = async (text: string, seq: number) => {
    try { await window.dots.api.writeClipboardText(text); setCopied(seq); clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(null), 1800); }
    catch { onError('Could not copy the result'); }
  };
  const speak = (text: string, seq: number) => {
    window.speechSynthesis.cancel();
    if (speaking === seq) { setSpeaking(null); utteranceRef.current = null; return; }
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ''));
    utteranceRef.current = utterance;
    utterance.onend = utterance.onerror = () => { setSpeaking(null); utteranceRef.current = null; };
    window.speechSynthesis.speak(utterance); setSpeaking(seq);
  };
  return <>{consolidated.map(event => {
    if (event.type === 'message' || event.type === 'final') return <div className={`assistant-message ${event.type === 'final' ? 'final-message' : ''}`} key={event.seq}>
      <div className="message-author"><DotAvatar dot={dot ?? undefined} size={25} /><strong>{dot?.name}</strong>{event.type === 'final' && status === 'succeeded' && <span className="message-complete"><Check size={12} /> Done</span>}</div>
      <div className="markdown-body"><ConversationMarkdown text={event.text} onOpenLink={onOpenLink} /></div>
      {event.type === 'final' && <div className="result-actions">
        <button className="icon-button" aria-label="Copy result" title="Copy result" onClick={() => void copy(event.text, event.seq)}>{copied === event.seq ? <Check size={14} /> : <Copy size={14} />}</button>
        {!!window.speechSynthesis && <button className="icon-button" aria-label={speaking === event.seq ? 'Stop reading' : 'Read result aloud'} title="Read aloud" onClick={() => speak(event.text, event.seq)}><Volume2 size={14} /></button>}
        <button className="text-button" onClick={onFollowup}><Clock size={13} /> Follow up later</button>
      </div>}
    </div>;
    if (event.type === 'tool' || event.type === 'reasoning') {
      const isOpen = expanded[event.seq] ?? (event.type === 'tool' && event.status === 'error');
      const working = event.type === 'tool' && event.status === 'running' && status === 'running';
      return <div className={`work-event ${isOpen ? 'is-expanded' : ''} ${event.type === 'tool' && event.status === 'error' ? 'error' : ''} ${working ? 'is-working' : ''}`} key={event.seq}>
        <button className="work-event-toggle" aria-expanded={isOpen} onClick={() => setExpanded(current => ({ ...current, [event.seq]: !isOpen }))}>
          {event.type === 'tool' ? <ActivityGlyph kind={toolActivity(event).kind} active={working} /> : <Brain size={14} />}
          <span className="work-event-label">{event.type === 'tool' ? TOOL_LABELS[event.name] ?? event.name : 'Thinking through the next step'}</span>
          {event.type === 'tool' && (event.status === 'ok' ? <Check size={13} /> : working ? <span className="mini-spinner" /> : event.status === 'error' ? <XCircle size={13} /> : null)}
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        {isOpen && <pre>{event.type === 'tool' ? [event.input, event.output].filter(Boolean).join('\n\n') : event.text}</pre>}
      </div>;
    }
    if (event.type === 'plan') return <div className="plan-card" key={event.seq}><span className="eyebrow">THE PLAN</span>{event.items.map((item, index) => <div key={index}>{item.done ? <CheckCircle2 size={15} /> : <span className="plan-circle" />}<span>{item.text}</span></div>)}</div>;
    if (event.type === 'file') return <button key={event.seq} className="file-event" onClick={() => onOpenLink(event.path)}><FileCode size={15} /><span>{event.change === 'add' ? 'Created' : event.change === 'delete' ? 'Deleted' : 'Updated'} <strong>{event.path}</strong></span></button>;
    if (event.type === 'log' && event.level !== 'info') return <div key={event.seq} className={`event-notice ${event.level}`}>{event.level === 'error' ? <XCircle size={14} /> : <Clock size={14} />}{event.text}</div>;
    return null;
  })}</>;
});
