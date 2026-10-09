import React, { useState, useEffect, useRef, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Terminal,
  FileCode,
  Globe,
  Search,
  Brain,
  CheckCircle2,
  XCircle,
  Clock,
  Square,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Target,
  Layers,
  Volume2,
  X,
  Folder,
  Plus,
  Pencil,
  Code2,
  Paperclip,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { DotAvatar } from "./DotAvatar";
import { ActivityGlyph } from "./ActivityGlyph";
import { toolActivity } from "@shared/activity";
import type { Run, RunEvent } from "@shared/types";
import { CODING_ACTIONS, type CodingIntent } from "@shared/coding";

function savedDraft(dotId: string): { prompt: string; references: string[]; intent: CodingIntent } {
  try {
    const draft = JSON.parse(sessionStorage.getItem(`dots:draft:${dotId}`) || '{}');
    return { prompt: typeof draft.prompt === 'string' ? draft.prompt : '', references: Array.isArray(draft.references) ? draft.references.filter((path: unknown) => typeof path === 'string').slice(0, 20) : [], intent: CODING_ACTIONS.some(action => action.id === draft.intent) ? draft.intent : 'build' };
  } catch { return { prompt: '', references: [], intent: 'build' }; }
}

const readable: Record<string, string> = {
  run_command: "Running a command",
  read_file: "Reading a file",
  write_file: "Writing a file",
  edit_file: "Editing a file",
  search_files: "Searching files",
  web_search: "Searching the web",
  web_fetch: "Reading a webpage",
  remember: "Remembering this",
  schedule_followup: "Scheduling a follow-up",
  list_dots: "Finding teammates",
  send_dot_message: "Messaging a teammate",
};
function consolidate(events: RunEvent[]): RunEvent[] {
  const result: RunEvent[] = [];
  const toolIndices = new Map<string, number>();
  const final = events.find((e) => e.type === "final");
  for (const e of events) {
    if (
      e.type === "message" &&
      final?.type === "final" &&
      e.text === final.text
    )
      continue;
    if (e.type === "tool") {
      const idx = toolIndices.get(e.id);
      if (idx !== undefined) result[idx] = e;
      else {
        toolIndices.set(e.id, result.length);
        result.push(e);
      }
    } else result.push(e);
  }
  return result;
}

export const RunTimeline: React.FC<{ dotId: string; coding?: boolean; onOpenProject?: () => void; fileReference?: { path: string; nonce: number }; onReferenceHandled?: () => void }> = ({ dotId, coding = false, onOpenProject, fileReference, onReferenceHandled }) => {
  const {
    activeDot,
    runs,
    selectedRunId,
    setSelectedRunId,
    activeRunEvents,
    streamingDraft,
    showToast,
    refreshRuns,
    setActiveTab,
  } = useApp();
  const [draft] = useState(() => savedDraft(dotId));
  const [prompt, setPrompt] = useState(draft.prompt);
  const [references, setReferences] = useState<string[]>(draft.references);
  const [intent, setIntent] = useState<CodingIntent>(draft.intent);
  const lastReference = useRef<number | undefined>(undefined);
  useEffect(() => {
    try { sessionStorage.setItem(`dots:draft:${dotId}`, JSON.stringify({ prompt, references, intent })); } catch { /* Drafts still work when storage is unavailable. */ }
  }, [dotId, prompt, references, intent]);
  useEffect(() => {
    if (!fileReference || lastReference.current === fileReference.nonce) return;
    lastReference.current = fileReference.nonce;
    setReferences(current => current.includes(fileReference.path) ? current : [...current, fileReference.path].slice(-20));
    onReferenceHandled?.();
  }, [fileReference, onReferenceHandled]);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [older, setOlder] = useState<{ run: Run; events: RunEvent[] }[]>([]);
  const [wakeEditor, setWakeEditor] = useState(false);
  const [wakePrompt, setWakePrompt] = useState("");
  const [wakeMinutes, setWakeMinutes] = useState(60);
  const [speaking, setSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const selected = runs.find((r) => r.id === selectedRunId) ?? null;
  const busy =
    activeDot?.status === "running" ||
    activeDot?.status === "queued" ||
    activeDot?.status === "awaiting-approval";
  const conversationId = selected?.conversationId;
  const previous = useMemo(
    () =>
      conversationId
        ? runs
            .filter(
              (r) =>
                (r.conversationId === conversationId || selected?.prefixRunIds?.includes(r.id)) &&
                r.id !== selectedRunId &&
                r.createdAt <= (selected?.createdAt ?? 0),
            )
            .sort((a, b) => a.createdAt - b.createdAt)
        : [],
    [runs, conversationId, selectedRunId, selected?.createdAt, selected?.prefixRunIds],
  );
  const previousIds = previous.map((r) => r.id).join("|");
  useEffect(() => {
    let alive = true;
    setOlder([]);
    Promise.all(
      previous.map(async (run) => ({
        run,
        events: await window.dots.api.getRunEvents(run.id),
      })),
    )
      .then((turns) => {
        if (alive) setOlder(turns);
      })
      .catch((e) => {
        if (alive) showToast(e.message, "error");
      });
    return () => {
      alive = false;
    };
  }, [previousIds, showToast]);
  useEffect(() => {
    nearBottom.current = true;
  }, [selectedRunId]);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller && nearBottom.current)
      scroller.scrollTop = scroller.scrollHeight;
  }, [activeRunEvents, streamingDraft, older]);
  useEffect(
    () => () => {
      window.speechSynthesis?.cancel();
    },
    [],
  );
  useEffect(() => {
    if (!wakeEditor) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWakeEditor(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [wakeEditor]);
  const send = async (text = prompt, retryProject?: Run['project']) => {
    if (!text.trim() || submitting || activeDot?.paused) return;
    try {
      setSubmitting(true);
      const project = retryProject ?? (coding || references.length ? { files: references, intent: coding ? intent : undefined } : undefined);
      const run = selected
        ? await window.dots.api.continueRun(selected.id, text.trim(), { project })
        : await window.dots.api.startRun(dotId, text.trim(), {
            newSession: true,
            project,
          });
      setPrompt("");
      setReferences([]);
      setSelectedRunId(run.id);
      await refreshRuns();
      if (busy)
        showToast(
          "Message queued. Your dot will pick it up after its current work.",
        );
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not send message",
        "error",
      );
    } finally {
      setSubmitting(false);
      textarea.current?.focus();
    }
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      showToast("Could not copy the result", "error");
    }
  };
  const revise = async (run: Run, text?: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const branch = await window.dots.api.reviseMessage(run.id, text);
      setEditingId(null);
      setPrompt("");
      setSelectedRunId(branch.id);
      await refreshRuns();
      showToast("Conversation restarted here. The original is saved in history.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not revise this message", "error");
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => { setEditingId(null); }, [selectedRunId, dotId]);
  const openLink = (href: string) => {
    if (/^https?:\/\//i.test(href)) {
      void window.dots.api
        .openExternal(href)
        .catch((e) => showToast(e.message, "error"));
      return;
    }
    if (
      /^[a-z]+:/i.test(href) &&
      !/^file:/i.test(href) &&
      !/^\w:[\\/]/.test(href)
    )
      return;
    let target = href.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "");
    try {
      target = decodeURIComponent(target);
    } catch {}
    if (target.startsWith("/") && /^\w:/.test(target.slice(1)))
      target = target.slice(1);
    else if (!/^\w:[\\/]/.test(target) && !target.startsWith("/"))
      target = `${activeDot?.workspacePath}/${target}`;
    void window.dots.api
      .openPath(target)
      .catch((e) => showToast(e.message, "error"));
  };
  const md = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) =>
        /^(https?:|file:|[a-z]:[\\/]|\/|\.|#)/i.test(url) || !url.includes(":")
          ? url
          : ""
      }
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (href) openLink(href);
            }}
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
  const speak = (text: string) => {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.replace(/[#*_`]/g, ""));
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };
  const renderEvents = (events: RunEvent[], run: Run) =>
    consolidate(events).map((e) => {
      const key = `${run.id}-${e.seq}`;
      if (e.type === "message" || e.type === "final")
        return (
          <div
            className={`assistant-message ${e.type === "final" ? "final-message" : ""}`}
            key={key}
          >
            <div className="message-author">
              <DotAvatar dot={activeDot ?? undefined} size={25} />
              <strong>{activeDot?.name}</strong>
              {e.type === "final" && (
                <span className="message-complete">
                  <Check size={12} /> Done
                </span>
              )}
            </div>
            <div className="markdown-body">{md(e.text)}</div>
            {e.type === "final" && (
              <div className="result-actions">
                <button
                  className="icon-button"
                  aria-label="Copy result"
                  title="Copy result"
                  onClick={() => copy(e.text)}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                {!!window.speechSynthesis && (
                  <button
                    className="icon-button"
                    aria-label={speaking ? "Stop reading" : "Read result aloud"}
                    title="Read aloud"
                    onClick={() => speak(e.text)}
                  >
                    <Volume2 size={14} />
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    setWakePrompt(
                      "Review the previous result and check what needs attention next.",
                    );
                    setWakeEditor(true);
                  }}
                >
                  <Clock size={13} /> Follow up later
                </button>
              </div>
            )}
          </div>
        );
      if (e.type === "tool" || e.type === "reasoning") {
        const isOpen =
          expanded[key] ?? (e.type === "tool" && e.status === "error");
        return (
          <div
            className={`work-event ${isOpen ? "is-expanded" : ""} ${e.type === "tool" && e.status === "error" ? "error" : ""} ${e.type === "tool" && e.status === "running" && run.status === "running" ? "is-working" : ""}`}
            key={key}
          >
            <button
              className="work-event-toggle"
              aria-expanded={isOpen}
              onClick={() => setExpanded((p) => ({ ...p, [key]: !isOpen }))}
            >
              {e.type === "tool" ? <ActivityGlyph kind={toolActivity(e).kind} active={e.status === "running" && run.status === "running"}/> : <Brain size={14} />}
              <span className="work-event-label">
                {e.type === "tool"
                  ? (readable[e.name] ?? e.name)
                  : "Thinking through the next step"}
              </span>
              {e.type === "tool" &&
                (e.status === "ok" ? (
                  <Check size={13} />
                ) : e.status === "running" ? (
                  <span className="mini-spinner" />
                ) : (
                  <XCircle size={13} />
                ))}
              {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
            {isOpen && (
              <pre>
                {e.type === "tool"
                  ? [e.input, e.output].filter(Boolean).join("\n\n")
                  : e.text}
              </pre>
            )}
          </div>
        );
      }
      if (e.type === "plan")
        return (
          <div className="plan-card" key={key}>
            <span className="eyebrow">THE PLAN</span>
            {e.items.map((i, j) => (
              <div key={j}>
                {i.done ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <span className="plan-circle" />
                )}
                <span>{i.text}</span>
              </div>
            ))}
          </div>
        );
      if (e.type === "file")
        return (
          <button
            key={key}
            className="file-event"
            onClick={() => openLink(e.path)}
          >
            <FileCode size={15} />
            <span>
              {e.change === "add"
                ? "Created"
                : e.change === "delete"
                  ? "Deleted"
                  : "Updated"}{" "}
              <strong>{e.path}</strong>
            </span>
          </button>
        );
      if (e.type === "log" && e.level !== "info")
        return (
          <div key={key} className={`event-notice ${e.level}`}>
            <AlertIcon level={e.level} />
            {e.text}
          </div>
        );
      return null;
    });
  const turns = [
    ...older,
    ...(selected ? [{ run: selected, events: activeRunEvents }] : []),
  ];
  return (
    <div className="conversation">
      {selected && (
        <div className="conversation-context">
          <span
            className={`status-dot ${selected.status === "running" ? "status-running" : "status-idle"}`}
          />
          <span>
            {selected.status === "running"
              ? "Working on your request"
              : selected.status === "queued"
                ? "Queued for your dot"
                : selected.status === "succeeded"
                  ? "Conversation"
                  : "Task " + selected.status}
          </span>
          <span className="conversation-context-title">{selected.title}</span>
          {["running", "queued"].includes(selected.status) && (
            <button
              className="text-button danger"
              onClick={() =>
                window.dots.api
                  .cancelRun(selected.id)
                  .catch((e) => showToast(e.message, "error"))
              }
            >
              <Square size={12} /> Stop task
            </button>
          )}
        </div>
      )}
      <div
        className="conversation-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          const s = e.currentTarget;
          nearBottom.current =
            s.scrollHeight - s.scrollTop - s.clientHeight < 100;
        }}
      >
        {!selected ? (
          <div className="conversation-welcome">
            <DotAvatar dot={activeDot ?? undefined} size={92} animated />
            <span className="eyebrow">{coding ? 'MAKE SOMETHING YOU WANT TO USE' : 'YOUR DOT, YOUR NEXT CHAPTER'}</span>
            <h1>{coding ? 'What do you want to build?' : 'What shall we take care of?'}</h1>
            <p>
              {coding ? 'Describe your idea. I’ll inspect the project, write the code, and check the result.' : <>I'm {activeDot?.name}. Give me something to work on,<br />and we'll keep building from there.</>}
            </p>
            <div className="conversation-suggestions">
              {[
                {
                  icon: <Globe size={18} />,
                  title: "Go a little deeper",
                  text: "Research a topic, compare the options, and write a concise briefing with sources.",
                },
                {
                  icon: <Target size={18} />,
                  title: "Keep something moving",
                  text: "Help me turn my priorities into a plan with clear next steps and decisions.",
                },
                {
                  icon: <Folder size={18} />,
                  title: "Make sense of my files",
                  text: "Explore the files in your workspace and give me a useful overview.",
                },
              ].map((s) => (
                <button
                  key={s.title}
                  onClick={() => {
                    setPrompt(s.text);
                    textarea.current?.focus();
                  }}
                >
                  {s.icon}
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="conversation-messages">
            {turns.map(({ run, events }) => (
              <React.Fragment key={run.id}>
                <div className={`user-message ${run.dotMessage ? "teammate-message" : ""}`}>
                  <span>{run.dotMessage ? `${run.dotMessage.kind === "reply" ? "Reply" : "Message"} from ${run.dotMessage.sourceDotName}` : "You"}</span>
                  {editingId === run.id ? (
                    <div className="message-editor">
                      <textarea aria-label="Edit your message" autoFocus value={editText}
                        disabled={submitting} onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape" && !submitting) setEditingId(null);
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void revise(run, editText); }
                        }} />
                      <p className="revision-hint">Starts a new branch from here. Earlier messages are kept; the original stays in history. Workspace changes and memory remain.</p>
                      <div className="message-actions">
                        <button disabled={submitting} onClick={() => setEditingId(null)}>Cancel</button>
                        <button disabled={submitting || busy || !editText.trim()} onClick={() => revise(run, editText)}>Save & resend</button>
                      </div>
                    </div>
                  ) : <p>{run.prompt}</p>}
                  {!!run.project?.files.length && <div className="message-file-references">{run.project.files.map(path => <span key={path} title={path}><Paperclip size={11} />{path}</span>)}</div>}
                  {run.trigger === "manual" && editingId !== run.id && (
                    <div className="message-actions">
                      <button disabled={submitting || busy || activeDot?.paused} title={busy ? "Wait for work to finish or stop it first" : "Edit and resend from this message"}
                        onClick={() => { setEditingId(run.id); setEditText(run.prompt); }}><Pencil size={13} /> Edit</button>
                      <button disabled={submitting || busy || activeDot?.paused} title="Resend this message in a new branch, keeping the original in history. Files and memory remain."
                        onClick={() => revise(run)}><RotateCcw size={13} /> Revert here</button>
                    </div>
                  )}
                </div>
                {renderEvents(events, run)}
                {(() => {
                  const lastUsage = events.findLast(event => event.type === 'usage');
                  const usage = lastUsage?.type === 'usage' ? lastUsage.usage : run.usage;
                  return usage ? <div className="run-token-usage">{usage.estimated ? 'Estimated: ' : ''}{(usage.inputTokens + usage.outputTokens).toLocaleString()} tokens · {usage.inputTokens.toLocaleString()} input · {usage.outputTokens.toLocaleString()} output{usage.cachedTokens ? ` · ${usage.cachedTokens.toLocaleString()} cached` : ''}</div> : null;
                })()}
                {run.status === "failed" && (
                  <div className="task-error">
                    <XCircle size={18} />
                    <div>
                      <strong>This task needs another try.</strong>
                      <p>{run.error}</p>
                      <button
                        className="text-button"
                        onClick={() => send(run.prompt, run.project)}
                      >
                        <RotateCcw size={13} /> Try again
                      </button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
            {streamingDraft && (
              <div className="assistant-message">
                <div className="message-author">
                  <DotAvatar dot={activeDot ?? undefined} size={25} />
                  <strong>{activeDot?.name}</strong>
                  <span className="mini-spinner" />
                </div>
                <div className="markdown-body">{md(streamingDraft)}</div>
              </div>
            )}
            {selected.status === "running" && !streamingDraft && (
              <div className="working-indicator">
                <span />
                <span />
                <span />
                <span>{activeDot?.name} is working. You can keep talking.</span>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="composer-wrap">
        {coding && <div className="coding-actions" aria-label="Coding actions">{CODING_ACTIONS.map(action => <button key={action.id} aria-pressed={intent === action.id} onClick={() => { setIntent(action.id); if (!prompt.trim() || CODING_ACTIONS.some(item => item.draft && item.draft === prompt)) setPrompt(action.draft); textarea.current?.focus(); }}><Code2 size={12} />{action.label}</button>)}</div>}
        <div className="composer">
          {!!references.length && <div className="composer-references" aria-label="Referenced files">{references.map(path => <button key={path} title={`Remove reference: ${path}`} aria-label={`Remove reference: ${path}`} onClick={() => setReferences(current => current.filter(item => item !== path))}><Paperclip size={12} /><span>{path}</span><X size={12} /></button>)}</div>}
          <textarea
            ref={textarea}
            aria-label={`Message ${activeDot?.name}`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              activeDot?.paused
                ? "Resume your dot to continue"
                : coding ? 'Describe an app, a change, or something to fix…' : `Message ${activeDot?.name ?? "your dot"}…`
            }
            rows={2}
            disabled={submitting || activeDot?.paused}
          />
          <div className="composer-actions">
            <div>
              <button
                className="icon-button"
                title="Browse workspace files"
                aria-label="Browse workspace files"
                onClick={() => onOpenProject ? onOpenProject() : setActiveTab("files")}
              >
                <Folder size={17} />
              </button>
              <button
                className="icon-button"
                title="Schedule a follow-up"
                aria-label="Schedule a follow-up"
                onClick={() => {
                  setWakePrompt(prompt);
                  setWakeEditor(true);
                }}
              >
                <Clock size={17} />
              </button>
              <span>
                {activeDot?.model === "auto"
                  ? "Recommended model"
                  : activeDot?.model}
              </span>
            </div>
            <button
              className="composer-send"
              aria-label={busy ? "Queue message" : "Send message"}
              title={busy ? "Queue after current task" : "Send message"}
              disabled={!prompt.trim() || submitting || activeDot?.paused}
              onClick={() => send()}
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
        <div className="composer-hint">
          <span>
            {busy
              ? "Your next message will queue after the current task."
              : coding ? 'Files stay in your workspace. References use their current contents.' : "Your dot keeps its memory between conversations."}
          </span>
          <span>Enter to send · Shift Enter for a new line</span>
        </div>
      </div>
      {wakeEditor && (
        <div className="modal-overlay" onClick={() => setWakeEditor(false)}>
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="Schedule conversation follow-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>A little later</h2>
              <button
                className="icon-button"
                aria-label="Close follow-up"
                onClick={() => setWakeEditor(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="modal-form">
              <label>
                What should your dot pick up?
                <textarea
                  autoFocus
                  rows={4}
                  value={wakePrompt}
                  onChange={(e) => setWakePrompt(e.target.value)}
                />
              </label>
              <label>
                Follow up in
                <select
                  value={wakeMinutes}
                  onChange={(e) => setWakeMinutes(Number(e.target.value))}
                >
                  <option value={15}>15 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={240}>4 hours</option>
                  <option value={1440}>Tomorrow, at this time</option>
                  <option value={10080}>Next week</option>
                </select>
              </label>
              <p className="panel-note">
                This continues the selected conversation. Dots needs to be
                running to wake up.
              </p>
            </div>
            <footer className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setWakeEditor(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={submitting || !wakePrompt.trim()}
                onClick={async () => {
                  try {
                    setSubmitting(true);
                    await window.dots.api.createFollowup(dotId, {
                      prompt: wakePrompt,
                      dueAt: Date.now() + wakeMinutes * 60000,
                      runId: selected?.id,
                    });
                    setWakeEditor(false);
                    showToast("Follow-up scheduled", "success");
                  } catch (e) {
                    showToast(
                      e instanceof Error
                        ? e.message
                        : "Could not schedule follow-up",
                      "error",
                    );
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                <Clock size={14} /> Schedule
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
function AlertIcon({ level }: { level: string }) {
  return level === "error" ? <XCircle size={14} /> : <Clock size={14} />;
}
