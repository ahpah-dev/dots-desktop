import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Plus, Search, MessageSquare, ChevronDown, X, Check, CircleAlert } from "lucide-react";
import { useApp } from "../context/AppContext";
import { relativeTime } from "./StudioPages";
import { summarizeConversations } from '@shared/conversation';
import './Conversation.css';

export const RunHistory: React.FC = () => {
  const { runs, selectedRunId, setSelectedRunId, activeDotId } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<'all' | 'active' | 'attention'>('all');
  const container = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const conversations = useMemo(() => summarizeConversations(runs), [runs]);
  const selected = runs.find(run => run.id === selectedRunId);
  const selectedConversation = selected?.conversationId || selected?.id;
  const filtered = conversations.filter(conversation => conversation.searchText.includes(query.trim().toLowerCase()) && (filter === 'all' || (filter === 'active' ? ['running', 'queued'].includes(conversation.latest.status) : ['failed', 'interrupted'].includes(conversation.latest.status))));
  useEffect(() => { setOpen(false); setQuery(''); setFilter('all'); }, [activeDotId]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape); };
  }, [open]);
  return (
    <div className="conversation-history" ref={container}>
      <button
        className="history-toggle"
        ref={toggle}
        aria-expanded={open}
        aria-controls="conversation-history-panel"
        onClick={() => setOpen(!open)}
      >
        <Clock size={14} /> Conversations <span>{conversations.length}</span>
        <ChevronDown size={14} />
      </button>
      <button
        className="text-button"
        onClick={() => {
          setSelectedRunId(null);
          setOpen(false);
        }}
      >
        <Plus size={14} /> New conversation
      </button>
      {open && (
        <div className="history-popover" id="conversation-history-panel" role="dialog" aria-label="Conversation history">
          <label className="inline-search">
            <Search size={14} />
            <input
              autoFocus
              aria-label="Search conversations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a conversation"
            />
            {!!query && <button className="icon-button" aria-label="Clear conversation search" onClick={() => setQuery('')}><X size={13} /></button>}
          </label>
          <div className="history-filters" aria-label="Filter conversations">
            {([{ id: 'all', label: 'All' }, { id: 'active', label: 'Working' }, { id: 'attention', label: 'Needs attention' }] as const).map(item => <button key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label}</button>)}
          </div>
          <div className="history-results">
            {filtered.map(({ id, latest: r, title, turns }) => (
                <button
                  key={r.id}
                  className={id === selectedConversation ? "selected" : ""}
                  aria-current={id === selectedConversation ? 'true' : undefined}
                  onClick={() => {
                    setSelectedRunId(r.id);
                    setOpen(false);
                  }}
                >
                  {r.status === 'failed' || r.status === 'interrupted' ? <CircleAlert size={15} /> : r.status === 'succeeded' ? <Check size={15} /> : <MessageSquare size={15} />}
                  <span>
                    <strong>{title}</strong>
                    <small>
                      {relativeTime(r.createdAt)} ·{" "}
                      {r.status === "succeeded" ? "Completed" : r.status === 'failed' ? 'Needs attention' : r.status === 'running' ? 'Working' : r.status === 'queued' ? 'Queued' : r.status === 'cancelled' ? 'Stopped' : 'Interrupted'} · {turns} {turns === 1 ? 'message' : 'messages'}
                    </small>
                  </span>
                </button>
              ))}
            {!filtered.length && <p className="panel-note">{conversations.length ? 'No conversations match. Try another word or filter.' : 'Conversations will appear here.'}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
