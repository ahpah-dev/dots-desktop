import React, { useState } from "react";
import {
  Plus,
  Settings,
  Search,
  Home,
  Activity,
  Inbox,
  Plug,
  Users,
  Command,
  ArrowUpRight,
} from "lucide-react";
import { useApp, type ViewType } from "../context/AppContext";
import { DotAvatar } from "./DotAvatar";
import { LogoMark } from "./LogoMark";

export const Sidebar: React.FC = () => {
  const {
    bootstrap,
    activeDotId,
    openDot,
    view,
    setView,
    setShowNewDotModal,
    setShowSettingsModal,
    setShowCommandPalette,
    auth,
    providerOptions,
    approvals,
  } = useApp();
  const [search, setSearch] = useState("");
  const dots = bootstrap?.dots ?? [];
  const filteredDots = dots.filter((dot) =>
    `${dot.name} ${dot.description}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const connected =
    !!(auth?.installed && auth?.loggedIn) ||
    providerOptions.some((p) => p.available);
  const nav: {
    id: ViewType;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }[] = [
    { id: "home", label: "Overview", icon: <Home size={17} /> },
    {
      id: "inbox",
      label: "Needs you",
      icon: <Inbox size={17} />,
      count: approvals.length,
    },
    { id: "teamwork", label: "Teamwork", icon: <Users size={17} /> },
    { id: "activity", label: "Activity", icon: <Activity size={17} /> },
    { id: "connections", label: "Connections", icon: <Plug size={17} /> },
  ];
  return (
    <aside className="studio-sidebar">
      <button
        className="studio-brand"
        onClick={() => setView("home")}
        aria-label="Dots overview"
      >
        <span className="brand-symbol"><LogoMark /></span>
        <span>
          dots<span className="brand-edition">DESKTOP</span>
        </span>
      </button>
      <button
        className="sidebar-search"
        onClick={() => setShowCommandPalette(true)}
      >
        <Search size={16} />
        <span>Find a dot or action</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav className="studio-nav" aria-label="Workspace">
        {nav.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? "selected" : ""}`}
            aria-current={view === n.id ? "page" : undefined}
            onClick={() => setView(n.id)}
          >
            {n.icon}
            <span>{n.label}</span>
            {!!n.count && <span className="nav-count">{n.count}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-section-title">
        <span>
          YOUR DOTS <span className="sidebar-dot-count">{dots.length}</span>
        </span>
        <button
          className="icon-button"
          aria-label="Create a dot"
          onClick={() => setShowNewDotModal(true)}
        >
          <Plus size={16} />
        </button>
      </div>
      {dots.length > 5 && (
        <label className="dot-filter">
          <Search size={14} />
          <input
            aria-label="Filter dots"
            placeholder="Find a dot"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      )}
      <div className="sidebar-dot-list">
        {filteredDots.map((dot) => (
            <button
              key={dot.id}
              className={`sidebar-dot ${view === "dot" && activeDotId === dot.id ? "selected" : ""}`}
              aria-current={
                view === "dot" && activeDotId === dot.id ? "page" : undefined
              }
              title={dot.description || dot.name}
              onClick={() => openDot(dot.id)}
            >
              <DotAvatar dot={dot} size={37} />
              <span className="sidebar-dot-info">
                <strong>{dot.name}</strong>
                <span>
                  {dot.paused || dot.status === "paused"
                    ? "Paused"
                    : dot.status === "idle"
                      ? "Here to help"
                      : dot.status === "awaiting-approval"
                        ? "Needs your approval"
                        : dot.status === "running"
                          ? "Working on it"
                          : dot.status === "queued"
                            ? "Work queued"
                            : "Paused"}
                </span>
              </span>
              <i className={`status-dot status-${dot.paused ? "paused" : dot.status}`} />
            </button>
          ))}
        {!dots.length && (
          <p className="sidebar-empty">
            A little help goes a long way.
            <br />
            Create your first dot.
          </p>
        )}
        {!!dots.length && !filteredDots.length && (
          <p className="sidebar-empty">No dots match “{search}”.</p>
        )}
        <button
          className="sidebar-add"
          onClick={() => setShowNewDotModal(true)}
        >
          <Plus size={16} /> Create a dot
        </button>
      </div>
      <div className="sidebar-bottom">
        <div className="local-status">
          <span
            className={`status-dot ${connected ? "status-idle" : "status-paused"}`}
          />
          <span>{connected ? "Connected & ready" : "Connect a provider"}</span>
          <span className="version-label">{bootstrap?.version}</span>
        </div>
        <button
          className="sidebar-account"
          onClick={() => setShowSettingsModal(true)}
        >
          <span className="account-avatar">
            {(auth?.email?.[0] ?? "Y").toUpperCase()}
          </span>
          <span>
            <strong>Your workspace</strong>
            <small>
              {auth?.loggedIn
                ? `ChatGPT ${auth.plan ?? "connected"}`
                : "Local & private"}
            </small>
          </span>
          <Settings size={17} />
        </button>
        <button
          className="sidebar-shortcuts"
          onClick={() => setShowCommandPalette(true)}
        >
          <Command size={13} /> Quick actions <ArrowUpRight size={12} />
        </button>
      </div>
    </aside>
  );
};
