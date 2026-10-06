import React, { useState } from "react";
import { Clock, Plus, Search, MessageSquare, ChevronDown } from "lucide-react";
import { useApp } from "../context/AppContext";
import { relativeTime } from "./StudioPages";

export const RunHistory: React.FC = () => {
  const { runs, selectedRunId, setSelectedRunId } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const conversations = new Map<string, (typeof runs)[number]>();
  for (const run of runs) {
    const key = run.conversationId || run.id;
    if (!conversations.has(key)) conversations.set(key, run);
  }
  return (
    <div className="conversation-history">
      <button
        className="history-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Clock size={14} /> Conversations <span>{conversations.size}</span>
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
        <div className="history-popover">
          <label className="inline-search">
            <Search size={14} />
            <input
              autoFocus
              aria-label="Search conversations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a conversation"
            />
          </label>
          <div>
            {[...conversations.values()]
              .filter((r) =>
                r.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map((r) => (
                <button
                  key={r.id}
                  className={r.id === selectedRunId ? "selected" : ""}
                  onClick={() => {
                    setSelectedRunId(r.id);
                    setOpen(false);
                  }}
                >
                  <MessageSquare size={15} />
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {relativeTime(r.createdAt)} ·{" "}
                      {r.status === "succeeded" ? "Completed" : r.status}
                    </small>
                  </span>
                </button>
              ))}
            {!conversations.size && (
              <p className="panel-note">Conversations will appear here.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
