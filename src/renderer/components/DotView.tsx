import React from "react";
import {
  MessageSquare,
  Brain,
  Folder,
  Clock,
  SlidersHorizontal,
  Play,
  Pause,
  ArrowLeft,
  ArrowUpRight,
  Target,
  Monitor,
  ShieldCheck,
  Plus,
  Plug,
} from "lucide-react";
import { useApp, type TabType } from "../context/AppContext";
import { RunTimeline } from "./RunTimeline";
import { RunHistory } from "./RunHistory";
import { DotMemory } from "./DotMemory";
import { DotFiles } from "./DotFiles";
import { DotSchedule } from "./DotSchedule";
import { DotSettings } from "./DotSettings";
import { DotAvatar } from "./DotAvatar";
import { Responsibilities } from "./Responsibilities";
import { ActivityGlyph } from "./ActivityGlyph";
import { activeTool, toolActivity } from "@shared/activity";

export const DotView: React.FC = () => {
  const {
    activeDot,
    activeTab,
    setActiveTab,
    showToast,
    setView,
    settings,
    setSelectedRunId,
    selectedRunId,
    activeRunEvents,
  } = useApp();
  if (!activeDot)
    return (
      <div className="empty-state">
        <Target size={32} />
        <h2>Choose your teammate</h2>
        <p>Open a dot to start a conversation and keep work moving.</p>
        <button className="btn-primary" onClick={() => setView("home")}>
          Back to overview
        </button>
      </div>
    );
  const togglePause = async () => {
    try {
      await window.dots.api.setDotPaused(activeDot.id, !activeDot.paused);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not change status",
        "error",
      );
    }
  };
  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: "tasks", label: "Conversation", icon: <MessageSquare size={15} /> },
    {
      id: "responsibilities",
      label: "Responsibilities",
      icon: <Target size={15} />,
    },
    { id: "memory", label: "Memory", icon: <Brain size={15} /> },
    { id: "files", label: "Files", icon: <Folder size={15} /> },
    { id: "schedule", label: "Scheduled", icon: <Clock size={15} /> },
    { id: "settings", label: "Profile", icon: <SlidersHorizontal size={15} /> },
  ];
  const tool = activeDot.activeRunId === selectedRunId && activeDot.status === "running" ? activeTool(activeRunEvents) : undefined;
  const activity = tool ? toolActivity(tool) : undefined;
  return (
    <main className="dot-workspace studio-dot-workspace">
      <header className="studio-workspace-header">
        <div className="workspace-breadcrumb">
          <button
            className="icon-button"
            aria-label="Back to overview"
            onClick={() => setView("home")}
          >
            <ArrowLeft size={17} />
          </button>
          <span>Your dots</span>
          <span>/</span>
          <strong>{activeDot.name}</strong>
          <div className="header-spacer" />
          <button className="btn-ghost" onClick={togglePause}>
            {activeDot.paused ? <Play size={14} /> : <Pause size={14} />}{" "}
            {activeDot.paused ? "Resume dot" : "Pause dot"}
          </button>
        </div>
        <div className="workspace-tabs" aria-label="Dot sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`workspace-tab ${activeTab === t.id ? "is-active" : ""}`}
              aria-pressed={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </header>
      <div className="dot-body">
        <div className="dot-primary" key={activeDot.id}>
          {activeTab === "tasks" && (
            <div className="conversation-layout">
              <RunTimeline dotId={activeDot.id} />
              <RunHistory />
            </div>
          )}
          {activeTab === "responsibilities" && (
            <Responsibilities dotId={activeDot.id} />
          )}
          {activeTab === "memory" && <DotMemory dotId={activeDot.id} />}
          {activeTab === "files" && <DotFiles dotId={activeDot.id} />}
          {activeTab === "schedule" && <DotSchedule dotId={activeDot.id} />}
          {activeTab === "settings" && <DotSettings dotId={activeDot.id} />}
        </div>
        {activeTab === "tasks" && (
          <aside className="dot-profile-rail">
            <div className="profile-mascot">
              <DotAvatar dot={activeDot} size={116} animated activity={activity?.kind} />
            </div>
            <h2>{activeDot.name}</h2>
            {activity && <div className="live-activity" role="status"><ActivityGlyph kind={activity.kind} active/><strong>{activity.label}</strong></div>}
            <span className="dot-handle">
              @{activeDot.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-dot
            </span>
            <span
              className={`profile-status ${activeDot.paused ? "paused" : ""}`}
            >
              <i className={`status-dot status-${activeDot.status}`} />
              {activeDot.status === "running"
                ? "Working on it"
                : activeDot.status === "awaiting-approval"
                  ? "Needs your input"
                  : activeDot.paused
                    ? "Taking a pause"
                    : "Here to help"}
            </span>
            <p>
              {activeDot.description ||
                "Your persistent teammate for the things that matter."}
            </p>
            <button
              className="btn-secondary"
              onClick={() => setActiveTab("settings")}
            >
              <SlidersHorizontal size={14} /> Personalize your dot
            </button>
            <div className="rail-section">
              <span className="eyebrow">WORKS WITH</span>
              <button onClick={() => setView("connections")}>
                <Plug size={16} />
                <span>
                  {activeDot.providerId === "codex"
                    ? "OpenAI Codex"
                    : "Custom AI provider"}
                  <small>
                    {activeDot.model === "auto"
                      ? "Recommended model"
                      : activeDot.model}
                  </small>
                </span>
                <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="rail-section">
              <span className="eyebrow">COMPUTER</span>
              <button
                onClick={() =>
                  window.dots.api
                    .openPath(activeDot.workspacePath)
                    .catch((e) => showToast(e.message, "error"))
                }
              >
                <Monitor size={16} />
                <span>
                  This computer
                  <small>
                    {settings?.runInBackground
                      ? "Runs in the system tray"
                      : "Runs while Dots is open"}
                  </small>
                </span>
                <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="rail-section">
              <span className="eyebrow">YOUR CONTROL</span>
              <button onClick={() => setActiveTab("settings")}>
                <ShieldCheck size={16} />
                <span>
                  Permissions & boundaries
                  <small>
                    {activeDot.permissions.outsideWorkspace
                      ? "Extended computer access"
                      : "Workspace access"}
                  </small>
                </span>
                <ArrowUpRight size={13} />
              </button>
            </div>
            <button
              className="rail-new-chat"
              onClick={() => setSelectedRunId(null)}
            >
              <Plus size={14} /> New conversation
            </button>
            <div className="rail-footnote">
              Remembers what matters.
              <br />
              Keeps you in the loop.
            </div>
          </aside>
        )}
      </div>
    </main>
  );
};
