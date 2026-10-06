import React, { useState, useEffect, useCallback } from "react";
import {
  Target,
  Plus,
  Play,
  Pause,
  Check,
  Pencil,
  Trash2,
  Clock,
  X,
  ArrowUpRight,
} from "lucide-react";
import type { DotTask, Followup, ScheduleSpec } from "@shared/types";
import { useApp } from "../context/AppContext";

function scheduleLabel(spec: ScheduleSpec | null) {
  if (!spec) return "Run when you choose";
  if (spec.kind === "interval") return `Every ${spec.everyMinutes} minutes`;
  if (spec.kind === "daily")
    return `${spec.days.length === 7 ? "Every day" : spec.days.length === 5 ? "Weekdays" : "Selected days"} at ${spec.time}`;
  return `Cron · ${spec.expr}`;
}
function localInputTime(ts: number) {
  const d = new Date(ts);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

export function Responsibilities({ dotId }: { dotId: string }) {
  const { activeDot, showToast, setActiveTab, setSelectedRunId } = useApp();
  const [tasks, setTasks] = useState<DotTask[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<DotTask | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [cadence, setCadence] = useState("manual");
  const [time, setTime] = useState("09:00");
  const [minutes, setMinutes] = useState(60);
  const [continueSession, setContinueSession] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [showFollowup, setShowFollowup] = useState(false);
  const [followupPrompt, setFollowupPrompt] = useState("");
  const [dueAt, setDueAt] = useState(localInputTime(Date.now() + 3600000));
  useEffect(() => {
    if (!editor && !showFollowup) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      if (showFollowup) setShowFollowup(false);
      else setEditor(null);
    };
    document.addEventListener("keydown", closeOnEscape, true);
    return () => document.removeEventListener("keydown", closeOnEscape, true);
  }, [editor, showFollowup, busy]);
  const reload = useCallback(async () => {
    try {
      const [t, f] = await Promise.all([
        window.dots.api.listTasks(dotId),
        window.dots.api.listFollowups(dotId),
      ]);
      setTasks(t);
      setFollowups(f);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Could not load responsibilities",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [dotId, showToast]);
  useEffect(() => {
    void reload();
    return window.dots.onEvent((e) => {
      if (e.type === "tasks" && e.dotId === dotId) setTasks(e.tasks);
      if (e.type === "followups" && e.dotId === dotId)
        setFollowups(e.followups);
    });
  }, [dotId, reload]);
  const edit = (task?: DotTask) => {
    setEditor(task ?? "new");
    setTitle(task?.title ?? "");
    setPrompt(task?.prompt ?? "");
    setContinueSession(task?.continueSession ?? true);
    const s = task?.schedule;
    setCadence(
      s?.kind === "cron"
        ? "cron"
        : s?.kind === "interval"
          ? "interval"
          : s?.kind === "daily"
            ? s.days.length === 5
              ? "weekdays"
              : "daily"
            : "manual",
    );
    setTime(s?.kind === "daily" ? s.time : "09:00");
    setMinutes(s?.kind === "interval" ? s.everyMinutes : 60);
    setCron(s?.kind === "cron" ? s.expr : "0 9 * * 1-5");
  };
  const action = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      setBusy(true);
      await fn();
      if (success) showToast(success, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Action failed", "error");
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    const schedule: ScheduleSpec | null =
      cadence === "cron"
        ? { kind: "cron", expr: cron }
        : cadence === "interval"
          ? { kind: "interval", everyMinutes: minutes }
          : cadence === "daily" || cadence === "weekdays"
            ? {
                kind: "daily",
                time,
                days:
                  cadence === "weekdays"
                    ? [1, 2, 3, 4, 5]
                    : [0, 1, 2, 3, 4, 5, 6],
              }
            : null;
    await action(async () => {
      if (typeof editor === "object" && editor)
        await window.dots.api.updateTask(editor.id, {
          title,
          prompt,
          schedule,
          continueSession,
        });
      else
        await window.dots.api.createTask(dotId, {
          title,
          prompt,
          schedule,
          continueSession,
        });
      setEditor(null);
    }, "Responsibility saved");
  };
  return (
    <div className="panel-page responsibilities-page">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">THE THINGS YOUR DOT OWNS</span>
          <h2>Keep the important things moving.</h2>
          <p>
            Give {activeDot?.name} ongoing work, with a rhythm and context of
            its own.
          </p>
        </div>
        <button className="btn-primary" onClick={() => edit()}>
          <Plus size={15} /> Add responsibility
        </button>
      </div>
      <div className="responsibility-list">
        {tasks.map((t) => (
          <article key={t.id} className={`responsibility-card ${t.status}`}>
            <div className="responsibility-card-head">
              <span className="responsibility-icon">
                <Target size={20} />
              </span>
              <div>
                <h3>{t.title}</h3>
                <span
                  className={`pill pill-${t.status === "active" ? "idle" : t.status === "completed" ? "succeeded" : "paused"}`}
                >
                  {t.status}
                </span>
              </div>
              <button
                className="icon-button"
                aria-label={`Edit ${t.title}`}
                onClick={() => edit(t)}
              >
                <Pencil size={15} />
              </button>
            </div>
            <p>{t.prompt}</p>
            <div className="responsibility-cadence">
              <Clock size={14} />
              {scheduleLabel(t.schedule)}
              {t.nextRunAt && (
                <span>Next: {new Date(t.nextRunAt).toLocaleString()}</span>
              )}
            </div>
            <footer>
              <button
                className="btn-secondary"
                disabled={busy || t.status !== "active" || activeDot?.paused}
                onClick={() =>
                  action(async () => {
                    const run = await window.dots.api.runTask(t.id);
                    setSelectedRunId(run.id);
                    setActiveTab("tasks");
                  })
                }
              >
                <Play size={13} /> Run now
              </button>
              <div>
                {t.status !== "completed" && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={
                      t.status === "paused"
                        ? "Resume responsibility"
                        : "Pause responsibility"
                    }
                    title={t.status === "paused" ? "Resume" : "Pause"}
                    onClick={() =>
                      action(() =>
                        window.dots.api.updateTask(t.id, {
                          status: t.status === "paused" ? "active" : "paused",
                        }),
                      )
                    }
                  >
                    {t.status === "paused" ? (
                      <Play size={15} />
                    ) : (
                      <Pause size={15} />
                    )}
                  </button>
                )}
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={
                    t.status === "completed"
                      ? "Reopen responsibility"
                      : "Complete responsibility"
                  }
                  title={t.status === "completed" ? "Reopen" : "Mark completed"}
                  onClick={() =>
                    action(() =>
                      window.dots.api.updateTask(t.id, {
                        status:
                          t.status === "completed" ? "active" : "completed",
                      }),
                    )
                  }
                >
                  <Check size={15} />
                </button>
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label={`Delete ${t.title}`}
                  onClick={() => action(() => window.dots.api.deleteTask(t.id))}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </footer>
          </article>
        ))}
      </div>
      {!tasks.length && (
        <div className="quiet-state responsibility-empty">
          <Target size={29} />
          <h3>
            {loading ? "Loading…" : "A responsibility is more than a task."}
          </h3>
          <p>
            Keep an eye on a project, prepare a daily brief, or maintain your
            workspace.
          </p>
          <button className="text-button" onClick={() => edit()}>
            Add your first responsibility <ArrowUpRight size={14} />
          </button>
        </div>
      )}
      <div className="section-heading followup-heading">
        <div>
          <h2>Follow-ups</h2>
          <p>One-time wake-ups for the next step.</p>
        </div>
        <button className="btn-secondary" onClick={() => setShowFollowup(true)}>
          <Plus size={14} /> Set a follow-up
        </button>
      </div>
      <div className="followup-list">
        {followups
          .filter((f) => f.status !== "cancelled")
          .map((f) => (
            <div className="followup-row" key={f.id}>
              <Clock size={17} />
              <div>
                <strong>{f.prompt}</strong>
                <small>
                  {new Date(f.dueAt).toLocaleString()} · {f.status}
                  {f.error && ` · ${f.error}`}
                </small>
              </div>
              {f.status === "pending" && (
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label="Cancel follow-up"
                  onClick={() =>
                    action(() => window.dots.api.cancelFollowup(f.id))
                  }
                >
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
        {!followups.some((f) => f.status !== "cancelled") && (
          <p className="panel-note">
            No follow-ups yet. Set a time and your dot will pick up the work.
          </p>
        )}
      </div>
      <p className="panel-note">
        Schedules use this computer's time zone (
        {Intl.DateTimeFormat().resolvedOptions().timeZone}). Keep your computer
        online and Dots running. Overdue work resumes when the app is available.
      </p>
      {editor && (
        <div className="modal-overlay" onClick={() => setEditor(null)}>
          <div
            className="modal-box responsibility-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit responsibility"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>
                {editor === "new"
                  ? "A new responsibility"
                  : "Edit responsibility"}
              </h2>
              <button
                className="icon-button"
                aria-label="Close editor"
                onClick={() => setEditor(null)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="modal-form">
              <label>
                Name
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Keep our project on track"
                  maxLength={120}
                />
              </label>
              <label>
                What should your dot take care of?
                <textarea
                  rows={5}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe what to check, which sources to use, and what deserves your attention."
                />
              </label>
              <div className="form-columns">
                <label>
                  When
                  <select
                    aria-label="Schedule cadence"
                    value={cadence}
                    onChange={(e) => setCadence(e.target.value)}
                  >
                    <option value="manual">When I ask</option>
                    <option value="daily">Every day</option>
                    <option value="weekdays">Every weekday</option>
                    <option value="interval">On an interval</option>
                    <option value="cron">Custom cron</option>
                  </select>
                </label>
                {cadence === "interval" ? (
                  <label>
                    Every (minutes)
                    <input
                      aria-label="Interval minutes"
                      type="number"
                      min={1}
                      max={10080}
                      value={minutes}
                      onChange={(e) => setMinutes(Number(e.target.value))}
                    />
                  </label>
                ) : cadence === "cron" ? (
                  <label>
                    Cron expression
                    <input
                      aria-label="Cron expression"
                      value={cron}
                      onChange={(e) => setCron(e.target.value)}
                    />
                  </label>
                ) : cadence !== "manual" ? (
                  <label>
                    Time
                    <input
                      aria-label="Scheduled time"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </label>
                ) : null}
              </div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={continueSession}
                  onChange={(e) => setContinueSession(e.target.checked)}
                />{" "}
                Keep the same conversation across runs
              </label>
            </div>
            <footer className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditor(null)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={
                  busy ||
                  !title.trim() ||
                  !prompt.trim() ||
                  (cadence === "interval" && minutes < 1)
                }
                onClick={save}
              >
                {busy ? "Saving…" : "Save responsibility"}
              </button>
            </footer>
          </div>
        </div>
      )}
      {showFollowup && (
        <div className="modal-overlay" onClick={() => setShowFollowup(false)}>
          <div
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-label="Set follow-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>Pick it up later</h2>
              <button
                className="icon-button"
                aria-label="Close follow-up"
                onClick={() => setShowFollowup(false)}
              >
                <X size={19} />
              </button>
            </div>
            <div className="modal-form">
              <label>
                What should your dot do?
                <textarea
                  rows={4}
                  value={followupPrompt}
                  onChange={(e) => setFollowupPrompt(e.target.value)}
                  autoFocus
                  placeholder="Check back on the project and bring me a short update."
                />
              </label>
              <label>
                Wake up at
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                />
              </label>
            </div>
            <footer className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowFollowup(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={busy || !followupPrompt.trim() || !dueAt}
                onClick={() =>
                  action(async () => {
                    await window.dots.api.createFollowup(dotId, {
                      prompt: followupPrompt,
                      dueAt: new Date(dueAt).getTime(),
                    });
                    setShowFollowup(false);
                    setFollowupPrompt("");
                  }, "Follow-up scheduled")
                }
              >
                <Clock size={14} /> Schedule follow-up
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
