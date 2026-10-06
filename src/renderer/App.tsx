import React, { useEffect } from "react";
import { useApp } from "./context/AppContext";
import { Sidebar } from "./components/Sidebar";
import { DotView } from "./components/DotView";
import { ApprovalBanner } from "./components/ApprovalBanner";
import { NewDotModal } from "./components/NewDotModal";
import { SettingsModal } from "./components/SettingsModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { TitleBar } from "./components/TitleBar";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import {
  Overview,
  ActivityPage,
  InboxPage,
  ConnectionsPage,
  CommandPalette,
} from "./components/StudioPages";

export const App: React.FC = () => {
  const {
    loading,
    bootstrapError,
    refreshBootstrap,
    toasts,
    dismissToast,
    view,
    setView,
    setShowCommandPalette,
    setShowNewDotModal,
    setShowSettingsModal,
    setShowOnboardingModal,
  } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setShowNewDotModal(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setShowSettingsModal(true);
      }
      if (e.key === "Escape") {
        setShowCommandPalette(false);
        setShowNewDotModal(false);
        setShowSettingsModal(false);
        setShowOnboardingModal(false);
      }
      if (e.key === "Tab") {
        const dialogs = document.querySelectorAll(
          ".modal-box, .command-palette",
        );
        const dialog = dialogs[dialogs.length - 1];
        if (!dialog) return;
        const focusable = [
          ...dialog.querySelectorAll<HTMLElement>(
            "button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]",
          ),
        ].filter((el) => el.offsetParent !== null && el.tabIndex >= 0);
        if (!focusable.length) return;
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !dialog.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    setShowCommandPalette,
    setShowNewDotModal,
    setShowSettingsModal,
    setShowOnboardingModal,
  ]);

  if (loading) {
    return (
      <div className="app-shell">
        <TitleBar />
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-app)",
            color: "var(--text-muted)",
          }}
        >
          <div
            className="spin"
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-full)",
              border: "2px solid var(--border-medium)",
              borderTopColor: "var(--accent-primary)",
              marginBottom: "1rem",
            }}
          />
          <div style={{ fontSize: "0.85rem" }}>Initializing Dots...</div>
        </div>
      </div>
    );
  }

  if (bootstrapError)
    return (
      <div className="app-shell">
        <TitleBar />
        <div className="empty-state">
          <AlertCircle size={30} />
          <h2>Your workspace couldn't open</h2>
          <p>{bootstrapError}</p>
          <button className="btn-primary" onClick={refreshBootstrap}>
            Try again
          </button>
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      <TitleBar />
      {/* Toast Notification Float */}
      <div
        style={{
          position: "fixed",
          bottom: "1rem",
          right: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          zIndex: 9999,
          pointerEvents: "none",
        }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.level === "error" ? "alert" : "status"}
            style={{
              pointerEvents: "auto",
              background: "var(--bg-card)",
              border: `1px solid ${
                t.level === "error"
                  ? "rgba(239, 68, 68, 0.4)"
                  : t.level === "success"
                    ? "rgba(16, 185, 129, 0.4)"
                    : "var(--border-medium)"
              }`,
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-md)",
              padding: "0.65rem 0.85rem",
              fontSize: "0.825rem",
              color: "var(--text-main)",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              minWidth: "240px",
              maxWidth: "380px",
              animation: "modal-enter 0.15s ease-out",
            }}
          >
            {t.level === "success" && (
              <CheckCircle2
                size={15}
                style={{ color: "#10b981", flexShrink: 0 }}
              />
            )}
            {t.level === "error" && (
              <AlertCircle
                size={15}
                style={{ color: "#ef4444", flexShrink: 0 }}
              />
            )}
            {t.level === "info" && (
              <Info size={15} style={{ color: "#818cf8", flexShrink: 0 }} />
            )}

            <span style={{ flex: 1, lineHeight: 1.35 }}>{t.text}</span>

            <button
              className="btn-ghost"
              aria-label="Dismiss notification"
              style={{ padding: "0.15rem" }}
              onClick={() => dismissToast(t.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Global Approval Banner if any approvals pending */}
      <ApprovalBanner />

      {/* Main Workspace Layout */}
      <div className="workspace-layout">
        <Sidebar />
        {view === "home" && <Overview />}
        {view === "activity" && <ActivityPage />}
        {view === "inbox" && <InboxPage />}
        {view === "connections" && <ConnectionsPage />}
        {view === "dot" && <DotView />}
      </div>

      {/* Overlays / Modals */}
      <NewDotModal />
      <SettingsModal />
      <OnboardingModal />
      <CommandPalette />
    </div>
  );
};
