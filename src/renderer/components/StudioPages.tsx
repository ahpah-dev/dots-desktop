import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Activity,
  Inbox,
  Plug,
  Monitor,
  Globe,
  Terminal,
  Brain,
  ShieldCheck,
  Search,
  RefreshCw,
  X,
  AlertCircle,
  MessageSquare,
  Target,
  ChevronRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { DotAvatar } from "./DotAvatar";
import type { Run } from "@shared/types";

export function relativeTime(ts: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
export function useActivity() {
  const [activity, setActivity] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestVersion = useRef(0);
  const updateVersion = useRef(0);
  const pushedRuns = useRef(new Map<string, { run: Run; version: number }>());
  const reload = useCallback(async () => {
    const request = ++requestVersion.current;
    const versionAtStart = updateVersion.current;
    try {
      const snapshot = await window.dots.api.listActivity(200);
      if (request !== requestVersion.current) return;
      const merged = new Map(snapshot.map((run) => [run.id, run]));
      for (const [id, update] of pushedRuns.current)
        if (update.version > versionAtStart) merged.set(id, update.run);
      setActivity(
        [...merged.values()]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 200),
      );
      setError("");
    } catch (e) {
      if (request === requestVersion.current)
        setError(e instanceof Error ? e.message : "Could not load activity");
    } finally {
      if (request === requestVersion.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    const unsubscribe = window.dots.onEvent((e) => {
      if (e.type === "run") {
        pushedRuns.current.set(e.run.id, {
          run: e.run,
          version: ++updateVersion.current,
        });
        setActivity((prev) =>
          [e.run, ...prev.filter((r) => r.id !== e.run.id)]
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, 200),
        );
      }
      if (e.type === "dot-removed") {
        for (const [id, update] of pushedRuns.current)
          if (update.run.dotId === e.dotId) pushedRuns.current.delete(id);
        setActivity((prev) => prev.filter((run) => run.dotId !== e.dotId));
        void reload();
      }
    });
    return () => {
      requestVersion.current++;
      unsubscribe();
    };
  }, [reload]);
  return { activity, loading, error, reload };
}

function ActivityRow({ run }: { run: Run }) {
  const { bootstrap, openDot } = useApp();
  const dot = bootstrap?.dots.find((d) => d.id === run.dotId);
  return (
    <button className="activity-row" onClick={() => openDot(run.dotId, run.id)}>
      <span className={`activity-icon ${run.status}`}>
        {run.status === "succeeded" ? (
          <Check size={17} />
        ) : run.status === "failed" ? (
          <AlertCircle size={17} />
        ) : (
          <Activity size={17} />
        )}
      </span>
      <span className="activity-info">
        <strong>{run.title}</strong>
        <small>
          {dot?.name ?? "Deleted dot"} <span>·</span>{" "}
          {run.trigger === "schedule"
            ? "Scheduled work"
            : run.trigger === "followup"
              ? "Follow-up"
              : run.trigger === "dot-message"
                ? `From ${run.dotMessage?.sourceDotName ?? "a teammate"}`
              : "Conversation"}{" "}
          <span>·</span> {relativeTime(run.createdAt)}
        </small>
      </span>
      <span className={`pill pill-${run.status}`}>
        {run.status === "succeeded"
          ? "Completed"
          : run.status === "running"
            ? "Working"
            : run.status}
      </span>
      <ChevronRight size={15} />
    </button>
  );
}

export function Overview() {
  const {
    bootstrap,
    openDot,
    setShowNewDotModal,
    setView,
    approvals,
    settings,
  } = useApp();
  const { activity, loading, error } = useActivity();
  const dots = bootstrap?.dots ?? [];
  const working = dots.filter(
    (d) => d.status === "running" || d.status === "queued",
  );
  return (
    <main className="studio-page overview-page">
      <header className="page-topbar">
        <span>Your workspace</span>
        <div className="topbar-status">
          <i className="status-dot status-idle" />{" "}
          {settings?.runInBackground ? "Background mode on" : "Desktop mode"}
          <span className="topbar-divider" />
          {new Date().toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </div>
      </header>
      <div className="page-inner">
        <div className="overview-heading">
          <div>
            <span className="eyebrow">A LITTLE MORE POSSIBLE</span>
            <h1>Good things are in motion.</h1>
            <p>
              Your dots remember, follow through, and bring you back into the
              loop.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => setShowNewDotModal(true)}
          >
            <Plus size={16} /> Create a dot
          </button>
        </div>
        <div className="overview-summary">
          <div>
            <span className="summary-icon">
              <Activity size={19} />
            </span>
            <span>
              <strong>{working.length}</strong>
              <small>Working right now</small>
            </span>
          </div>
          <button onClick={() => setView("inbox")}>
            <span className="summary-icon amber">
              <Inbox size={19} />
            </span>
            <span>
              <strong>{approvals.length}</strong>
              <small>Need your input</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
          <button onClick={() => setView("activity")}>
            <span className="summary-icon">
              <CheckCircle2 size={19} />
            </span>
            <span>
              <strong>
                {activity.filter((r) => r.status === "succeeded").length}
              </strong>
              <small>Completed in recent activity</small>
            </span>
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="section-heading">
          <h2>
            Your dots <span>{dots.length}</span>
          </h2>
          <span>A teammate for every kind of work</span>
        </div>
        <div className="dot-card-grid">
          {dots.map((dot) => (
            <button
              className="overview-dot-card"
              key={dot.id}
              onClick={() => openDot(dot.id)}
            >
              <div className="dot-card-top">
                <div
                  className="card-avatar-well"
                  style={{ "--dot-color": dot.color } as React.CSSProperties}
                >
                  <DotAvatar dot={dot} size={78} animated />
                </div>
                <ArrowUpRight size={17} />
              </div>
              <div className="dot-card-title">
                <h3>{dot.name}</h3>
                <i className={`status-dot status-${dot.status}`} />
              </div>
              <p>
                {dot.description ||
                  "Your personal teammate. Ready when you are."}
              </p>
              <div className="dot-card-footer">
                <span>
                  {dot.paused
                    ? "Paused"
                    : dot.status === "running"
                      ? "Working on it"
                      : dot.status === "awaiting-approval"
                        ? "Needs your approval"
                        : "Here to help"}
                </span>
                {dot.lastRunAt && <small>{relativeTime(dot.lastRunAt)}</small>}
              </div>
            </button>
          ))}
          <button
            className="create-dot-card"
            onClick={() => setShowNewDotModal(true)}
          >
            <span>
              <Plus size={25} />
            </span>
            <h3>Meet your next dot</h3>
            <p>
              Give it a name. Give it a purpose.
              <br />
              Let it take things from here.
            </p>
            <div>
              Create a dot <ArrowRight size={15} />
            </div>
          </button>
        </div>
        <div className="overview-lower">
          <section>
            <div className="section-heading">
              <h2>Recently in motion</h2>
              <button
                className="text-button"
                onClick={() => setView("activity")}
              >
                All activity <ArrowRight size={14} />
              </button>
            </div>
            <div className="activity-list">
              {activity.slice(0, 4).map((r) => (
                <ActivityRow key={r.id} run={r} />
              ))}
              {!activity.length && (
                <div className="quiet-state">
                  <MessageSquare size={23} />
                  <p>
                    {loading
                      ? "Loading activity…"
                      : error || "Your story starts with a conversation."}
                  </p>
                  <span>
                    Give a dot something to work on. Its progress appears here.
                  </span>
                </div>
              )}
            </div>
          </section>
          <section className="getting-started-card">
            <span className="eyebrow">BETTER TOGETHER</span>
            <h3>
              A dot becomes yours
              <br />
              as you work together.
            </h3>
            <p>
              Share a preference. Hand over a responsibility. Set a follow-up.
              Keep building on the same conversation.
            </p>
            <button
              className="text-button"
              onClick={() =>
                dots[0] ? openDot(dots[0].id) : setShowNewDotModal(true)
              }
            >
              Start a conversation <ArrowRight size={15} />
            </button>
            <div className="tiny-mascots">
              {dots.slice(0, 3).map((d) => (
                <DotAvatar key={d.id} dot={d} size={38} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export function ActivityPage() {
  const { activity, loading, error, reload } = useActivity();
  const { bootstrap } = useApp();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [dotId, setDotId] = useState("all");
  const filtered = activity.filter(
    (r) =>
      (filter === "all" ||
        (filter === "working" && ["running", "queued"].includes(r.status)) ||
        (filter === "completed" && r.status === "succeeded") ||
        (filter === "issues" &&
          ["failed", "interrupted"].includes(r.status))) &&
      (dotId === "all" || r.dotId === dotId) &&
      `${r.title} ${r.prompt}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main className="studio-page">
      <header className="page-topbar">
        <span>Activity</span>
        <button className="btn-ghost" onClick={reload}>
          <RefreshCw size={14} /> Refresh
        </button>
      </header>
      <div className="page-inner">
        <div className="page-heading">
          <span className="eyebrow">THE WHOLE PICTURE</span>
          <h1>Work, as it happens.</h1>
          <p>Every conversation, scheduled run, and follow-up in one place.</p>
        </div>
        <div className="filter-bar">
          <div className="segmented-control">
            {["all", "working", "completed", "issues"].map((f) => (
              <button
                key={f}
                aria-pressed={filter === f}
                className={filter === f ? "active" : ""}
                onClick={() => setFilter(f)}
              >
                {f[0].toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <select
            aria-label="Filter activity by dot"
            value={dotId}
            onChange={(e) => setDotId(e.target.value)}
          >
            <option value="all">All dots</option>
            {bootstrap?.dots.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <label className="inline-search">
            <Search size={15} />
            <input
              placeholder="Search activity"
              aria-label="Search activity"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="activity-list">
          {filtered.map((r) => (
            <ActivityRow key={r.id} run={r} />
          ))}
          {!filtered.length && (
            <div className="quiet-state">
              <Activity size={30} />
              <h3>
                {loading
                  ? "Loading activity…"
                  : error
                    ? "Activity unavailable"
                    : "Nothing here yet"}
              </h3>
              <p>
                {error || "Activity matching your filters will appear here."}
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export function InboxPage() {
  const { approvals, openDot, showToast } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const resolve = async (id: string, approve: boolean) => {
    try {
      setBusy(id);
      await window.dots.api.resolveApproval(id, approve);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not resolve approval",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };
  return (
    <main className="studio-page">
      <header className="page-topbar">
        <span>Needs you</span>
        <span className="topbar-status">
          {approvals.length} pending decisions
        </span>
      </header>
      <div className="page-inner">
        <div className="page-heading">
          <span className="eyebrow">YOU HAVE THE FINAL SAY</span>
          <h1>A moment for your judgment.</h1>
          <p>Your dots bring you in when the next step needs a decision.</p>
        </div>
        {approvals.length ? (
          <div className="approval-cards">
            {approvals.map((a) => (
              <article className="decision-card" key={a.id}>
                <div>
                  <span className="decision-icon">
                    <ShieldCheck size={21} />
                  </span>
                  <div>
                    <span className="eyebrow">
                      {a.dotName} · {relativeTime(a.createdAt)}
                    </span>
                    <h3>{a.summary}</h3>
                  </div>
                </div>
                {a.detail && <pre>{a.detail}</pre>}
                <footer>
                  <button
                    className="text-button"
                    onClick={() => openDot(a.dotId, a.runId)}
                  >
                    Review task <ArrowUpRight size={14} />
                  </button>
                  <div>
                    <button
                      className="btn-secondary"
                      disabled={busy === a.id}
                      onClick={() => resolve(a.id, false)}
                    >
                      Decline
                    </button>
                    <button
                      className="btn-primary"
                      disabled={busy === a.id}
                      onClick={() => resolve(a.id, true)}
                    >
                      <Check size={14} /> Approve
                    </button>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="inbox-empty">
            <span>
              <Check size={32} />
            </span>
            <h2>You're all caught up.</h2>
            <p>
              No decisions waiting on you.
              <br />
              Your dots will let you know when they need a hand.
            </p>
            <span className="inbox-footnote">
              A little space to focus on your own work.
            </span>
          </div>
        )}
      </div>
    </main>
  );
}

export function ConnectionsPage() {
  const {
    auth,
    providers,
    settings,
    setShowSettingsModal,
    showToast,
    refreshProviders,
  } = useApp();
  const [testing, setTesting] = useState(false);
  const refresh = async () => {
    try {
      setTesting(true);
      await window.dots.api.refreshAuth();
      await refreshProviders();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Connection check failed",
        "error",
      );
    } finally {
      setTesting(false);
    }
  };
  return (
    <main className="studio-page">
      <header className="page-topbar">
        <span>Connections</span>
        <button className="btn-ghost" onClick={refresh} disabled={testing}>
          <RefreshCw size={14} className={testing ? "spin" : ""} /> Check
          connections
        </button>
      </header>
      <div className="page-inner">
        <div className="page-heading">
          <span className="eyebrow">GIVE YOUR DOT ROOM TO HELP</span>
          <h1>Connected to your world.</h1>
          <p>Manage the models, computer, and tools your dots can work with.</p>
        </div>
        <div className="connection-grid">
          <article className="connection-card">
            <span className="connection-icon">
              <Plug size={24} />
            </span>
            <span
              className={`connection-badge ${auth?.loggedIn ? "connected" : ""}`}
            >
              {auth?.installed && auth.loggedIn ? "Connected" : "Setup needed"}
            </span>
            <h3>OpenAI Codex</h3>
            <p>
              Use your existing Codex sign-in. Models are discovered from your
              account.
            </p>
            <div className="connection-detail">
              {auth?.loggedIn
                ? auth.email || `ChatGPT ${auth.plan || "account"}`
                : auth?.installed
                  ? "Installed · Sign in to begin"
                  : "Install or locate Codex CLI"}
            </div>
            <button
              className="btn-secondary"
              onClick={() => setShowSettingsModal(true)}
            >
              Manage account <ArrowUpRight size={14} />
            </button>
          </article>
          <article className="connection-card">
            <span className="connection-icon">
              <Monitor size={24} />
            </span>
            <span className="connection-badge connected">Local</span>
            <h3>This computer</h3>
            <p>
              Each dot gets its own workspace, file access, and permissions on
              this device.
            </p>
            <div className="connection-detail">
              {settings?.runInBackground
                ? "Background work enabled"
                : "Background work disabled"}{" "}
              · {settings?.maxConcurrentRuns || 1} parallel dots
            </div>
            <button
              className="btn-secondary"
              onClick={() => setShowSettingsModal(true)}
            >
              Computer settings <ArrowUpRight size={14} />
            </button>
          </article>
          <article className="connection-card">
            <span className="connection-icon">
              <Terminal size={24} />
            </span>
            <span
              className={`connection-badge ${settings?.useCodexUserConfig ? "connected" : ""}`}
            >
              {settings?.useCodexUserConfig ? "Enabled" : "Optional"}
            </span>
            <h3>Your Codex tools</h3>
            <p>
              Let Codex-backed dots use the MCP servers, plugins, and hooks in
              your Codex configuration.
            </p>
            <div className="connection-detail">
              Configured tools keep their own access requirements.
            </div>
            <button
              className="btn-secondary"
              onClick={() =>
                window.dots.api
                  .updateSettings({
                    useCodexUserConfig: !settings?.useCodexUserConfig,
                  })
                  .catch((e) => showToast(e.message, "error"))
              }
            >
              {settings?.useCodexUserConfig
                ? "Use isolated configuration"
                : "Enable configured tools"}
            </button>
          </article>
          {providers.map((p) => (
            <article className="connection-card" key={p.id}>
              <span className="connection-icon">
                <Globe size={24} />
              </span>
              <span className="connection-badge">Configured</span>
              <h3>{p.label}</h3>
              <p className="break-word">{p.baseUrl}</p>
              <div className="connection-detail">
                {p.defaultModel || "Choose a model in your dot profile"}
              </div>
              <button
                className="btn-secondary"
                onClick={() =>
                  window.dots.api
                    .testProvider(p.id)
                    .then((r) =>
                      showToast(r.message, r.ok ? "success" : "error"),
                    )
                    .catch((e) => showToast(e.message, "error"))
                }
              >
                Test connection
              </button>
            </article>
          ))}
        </div>
        <div className="connection-bottom">
          <div>
            <ShieldCheck size={20} />
            <h3>Access stays in your hands.</h3>
            <p>
              Set workspace, shell, web, and action permissions separately for
              every dot.
            </p>
          </div>
          <button
            className="btn-secondary"
            onClick={() => setShowSettingsModal(true)}
          >
            <Plus size={15} /> Add an AI provider
          </button>
        </div>
        <div className="capability-note">
          <strong>About cloud and messaging</strong>
          <p>
            This edition runs on your computer. Cloud computers, OpenAI's
            ChatGPT memory, and native Slack, Teams, and voice calling require
            separate service integrations. They aren't connected by this desktop
            app.
          </p>
        </div>
      </div>
    </main>
  );
}

export function CommandPalette() {
  const {
    showCommandPalette,
    setShowCommandPalette,
    bootstrap,
    openDot,
    setView,
    setShowNewDotModal,
    setShowSettingsModal,
  } = useApp();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const commands = [
    { label: "Overview", hint: "Your workspace", run: () => setView("home") },
    {
      label: "Needs you",
      hint: "Review approvals",
      run: () => setView("inbox"),
    },
    {
      label: "Activity",
      hint: "All recent work",
      run: () => setView("activity"),
    },
    {
      label: "Connections",
      hint: "Models & tools",
      run: () => setView("connections"),
    },
    {
      label: "Create a dot",
      hint: "Ctrl N",
      run: () => setShowNewDotModal(true),
    },
    {
      label: "Settings",
      hint: "Ctrl ,",
      run: () => setShowSettingsModal(true),
    },
    ...(bootstrap?.dots ?? []).map((d) => ({
      label: d.name,
      hint: d.description || "Open conversation",
      run: () => openDot(d.id),
    })),
  ].filter((c) =>
    `${c.label} ${c.hint}`.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    if (showCommandPalette) {
      setQuery("");
      setIndex(0);
    }
  }, [showCommandPalette]);
  if (!showCommandPalette) return null;
  const choose = (i: number) => {
    commands[i]?.run();
    setShowCommandPalette(false);
  };
  return (
    <div
      className="modal-overlay command-overlay"
      onClick={() => setShowCommandPalette(false)}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search workspace"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndex((i) => Math.min(i + 1, commands.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndex((i) => Math.max(i - 1, 0));
          }
          if (e.key === "Enter") {
            e.preventDefault();
            choose(index);
          }
          if (e.key === "Escape") setShowCommandPalette(false);
        }}
      >
        <div className="command-input">
          <Search size={20} />
          <input
            autoFocus
            placeholder="Where would you like to go?"
            aria-label="Search commands and dots"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
          />
          <button
            className="icon-button"
            aria-label="Close search"
            onClick={() => setShowCommandPalette(false)}
          >
            <X size={17} />
          </button>
        </div>
        <div className="command-results">
          {commands.map((c, i) => (
            <button
              key={c.label + i}
              className={i === index ? "selected" : ""}
              onMouseEnter={() => setIndex(i)}
              onClick={() => choose(i)}
            >
              <span>
                {c.label}
                <small>{c.hint}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
          {!commands.length && (
            <div className="quiet-state">No matches. Try a dot's name.</div>
          )}
        </div>
        <footer>
          <kbd>↑↓</kbd> to navigate <kbd>Enter</kbd> to open <kbd>Esc</kbd> to
          close
        </footer>
      </div>
    </div>
  );
}
