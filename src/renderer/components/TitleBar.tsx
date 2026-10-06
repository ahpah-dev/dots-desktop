import { useEffect, useState } from "react";
import { Copy, Minus, Square, X } from "lucide-react";
import { LogoMark } from "./LogoMark";
import type { WindowAction, WindowState } from "@shared/api";
import { useApp } from "../context/AppContext";

export function TitleBar() {
  const { activeDot, view, showToast } = useApp();
  const [state, setState] = useState<WindowState>({
    maximized: false,
    focused: true,
    fullscreen: false,
  });
  const chrome = window.dots.window;

  useEffect(() => {
    if (!chrome.customTitleBar) return;
    let active = true;
    // Subscribe before requesting state; ignore a snapshot if a newer event arrives.
    let changed = false;
    const unsubscribe = chrome.onStateChanged((next) => {
      changed = true;
      setState(next);
    });
    chrome
      .getState()
      .then((next) => {
        if (active && !changed) setState(next);
      })
      .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [chrome]);

  if (!chrome.customTitleBar || state.fullscreen) return null;

  const control = (action: WindowAction) => {
    chrome
      .control(action)
      .catch(() =>
        showToast("Unable to update the window. Please try again.", "error"),
      );
  };

  return (
    <header
      className={`title-bar${state.focused ? "" : " title-bar-inactive"}`}
    >
      <div className="title-bar-brand">
        <LogoMark size={18} />
        <span>Dots</span>
      </div>
      <div className="title-bar-context">
        {view === "dot"
          ? activeDot?.name
          : view === "home"
            ? "Your workspace"
            : view === "inbox"
              ? "Needs you"
              : view[0].toUpperCase() + view.slice(1)}
      </div>
      <div className="window-controls" aria-label="Window controls">
        <button
          className="window-control"
          aria-label="Minimize window"
          title="Minimize"
          onClick={() => control("minimize")}
        >
          <Minus size={14} />
        </button>
        <button
          className="window-control"
          aria-label={state.maximized ? "Restore window" : "Maximize window"}
          title={state.maximized ? "Restore" : "Maximize"}
          onClick={() => control("toggle-maximize")}
        >
          {state.maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          className="window-control window-control-close"
          aria-label="Close window"
          title="Close"
          onClick={() => control("close")}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
