import { useEffect, useState } from "react";
import {
  Clock,
  CalendarDays,
  Repeat2,
  Code2,
  Save,
  Play,
  Info,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { Schedule, ScheduleSpec } from "@shared/types";
import { describeSpec, nextRun, validateSpec } from "@shared/schedule";
import {
  Field,
  PanelHeader,
  PanelSection,
  SettingRow,
  Toggle,
  errorMessage,
} from "./PanelPrimitives";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function scheduleDraft(schedule?: Schedule | null) {
  return {
    enabled: schedule?.enabled ?? false,
    kind: schedule?.spec.kind || "daily",
    everyMinutes:
      schedule?.spec.kind === "interval" ? schedule.spec.everyMinutes : 60,
    time: schedule?.spec.kind === "daily" ? schedule.spec.time : "09:00",
    days:
      schedule?.spec.kind === "daily" ? schedule.spec.days : [1, 2, 3, 4, 5],
    cron: schedule?.spec.kind === "cron" ? schedule.spec.expr : "0 9 * * 1-5",
    prompt: schedule?.prompt || "",
    continueSession: schedule?.continueSession ?? false,
  };
}

export function DotSchedule({ dotId }: { dotId: string }) {
  const {
    activeDot,
    showToast,
    refreshBootstrap,
    setActiveTab,
    setSelectedRunId,
    refreshRuns,
  } = useApp();
  const [draft, setDraft] = useState(() => scheduleDraft(activeDot?.schedule));
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    setDraft(scheduleDraft(activeDot?.schedule));
  }, [dotId]);
  const update = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => setDraft((previous) => ({ ...previous, [key]: value }));
  const spec: ScheduleSpec =
    draft.kind === "interval"
      ? { kind: "interval", everyMinutes: draft.everyMinutes }
      : draft.kind === "daily"
        ? { kind: "daily", time: draft.time, days: draft.days }
        : { kind: "cron", expr: draft.cron.trim() };
  let error = "",
    description = "",
    next: number | null = null;
  try {
    validateSpec(spec);
    description = describeSpec(spec);
    next = nextRun(spec, Date.now());
  } catch (failure) {
    error = errorMessage(failure, "Review the schedule timing.");
  }
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify(scheduleDraft(activeDot?.schedule));
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const save = async () => {
    if (error) {
      showToast(error, "error");
      return;
    }
    if (draft.enabled && !draft.prompt.trim()) {
      showToast("Add instructions before enabling a schedule.", "error");
      return;
    }
    try {
      setSaving(true);
      const schedule: Schedule = {
        enabled: draft.enabled,
        spec,
        prompt: draft.prompt.trim(),
        continueSession: draft.continueSession,
      };
      const saved = await window.dots.api.updateDot(dotId, { schedule });
      setDraft(scheduleDraft(saved.schedule));
      await refreshBootstrap();
      showToast(
        draft.enabled ? "Schedule saved and enabled." : "Schedule saved.",
        "success",
      );
    } catch (failure) {
      showToast(errorMessage(failure, "Could not save the schedule."), "error");
    } finally {
      setSaving(false);
    }
  };
  const runOnce = async () => {
    if (!draft.prompt.trim()) return;
    try {
      setRunning(true);
      const run = await window.dots.api.startRun(dotId, draft.prompt.trim(), {
        newSession: !draft.continueSession,
      });
      await refreshRuns();
      setSelectedRunId(run.id);
      setActiveTab("tasks");
      showToast("Task started. Your schedule is unchanged.", "success");
    } catch (failure) {
      showToast(errorMessage(failure, "Could not start the task."), "error");
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="profile-panel">
      <PanelHeader
        eyebrow="Keep the work moving"
        title="Scheduled work"
        description="A regular check-in for the things you want your dot to keep track of."
        actions={
          <button
            className="btn-primary"
            onClick={save}
            disabled={
              saving ||
              !dirty ||
              !!error ||
              (draft.enabled && !draft.prompt.trim())
            }
          >
            {saving ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}{" "}
            Save schedule
          </button>
        }
      />
      <div className="schedule-summary">
        <div className="schedule-summary-icon">
          <Clock size={21} />
        </div>
        <div>
          <strong>
            {activeDot?.schedule?.enabled
              ? describeSpec(activeDot.schedule.spec)
              : "No active recurring check-in"}
          </strong>
          <p>
            {activeDot?.paused
              ? "Your dot is paused. Scheduled runs wait until you resume it."
              : activeDot?.schedule?.enabled && activeDot.nextRunAt
                ? `Next run ${new Date(activeDot.nextRunAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                : "Set a time and give your dot something to watch over."}{" "}
            · {timeZone}
          </p>
        </div>
      </div>
      <PanelSection title="A regular check-in">
        <SettingRow
          title="Enable this schedule"
          description="Run these instructions automatically at the times you choose."
        >
          <Toggle
            label="Enable schedule"
            checked={draft.enabled}
            onChange={(value) => update("enabled", value)}
          />
        </SettingRow>
        <div style={{ marginTop: 24 }}>
          <ScheduleTiming
            spec={spec}
            onChange={(value) => {
              update("kind", value.kind);
              if (value.kind === "interval")
                update("everyMinutes", value.everyMinutes);
              else if (value.kind === "daily") {
                update("time", value.time);
                update("days", value.days);
              } else update("cron", value.expr);
            }}
          />
        </div>
        {error ? (
          <p className="schedule-inline-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="profile-note">
            <CalendarDays size={15} />
            <div>
              <strong>{description}</strong>
              {next && (
                <>
                  <br />
                  {draft.enabled ? "Upcoming" : "Preview"}:{" "}
                  {new Date(next).toLocaleString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}{" "}
                  · {timeZone}
                </>
              )}
            </div>
          </div>
        )}
      </PanelSection>
      <PanelSection
        title="What should your dot do?"
        description="Give it a clear responsibility, the sources to check, and when you want an update."
      >
        <div className="profile-stack">
          <Field label="Task instructions">
            <textarea
              rows={5}
              value={draft.prompt}
              onChange={(event) => update("prompt", event.target.value)}
              placeholder="Each weekday morning, check the project for changes. Summarize anything that needs my attention and suggest the next step."
            />
          </Field>
          <SettingRow
            title="Keep the conversation going"
            description="Continue the previous conversation so your dot keeps relevant task context."
          >
            <Toggle
              label="Continue conversation"
              checked={draft.continueSession}
              onChange={(value) => update("continueSession", value)}
            />
          </SettingRow>
          <div
            className="profile-actions"
            style={{ justifyContent: "flex-end" }}
          >
            <button
              className="btn-secondary"
              onClick={runOnce}
              disabled={
                running ||
                !draft.prompt.trim() ||
                !!activeDot?.activeRunId ||
                !!activeDot?.paused
              }
            >
              {running ? (
                <Loader2 size={13} className="spin" />
              ) : (
                <Play size={13} />
              )}{" "}
              Run once now
            </button>
          </div>
        </div>
      </PanelSection>
      <div className="profile-note">
        <Info size={15} />
        <div>
          Schedules use this computer’s time zone and run while Dots is open,
          including in the system tray. For multiple ongoing responsibilities,{" "}
          <button
            className="profile-text-button"
            onClick={() => setActiveTab("responsibilities")}
          >
            open responsibilities{" "}
            <ArrowUpRight size={11} style={{ verticalAlign: "middle" }} />
          </button>
          .
        </div>
      </div>
    </div>
  );
}

export function ScheduleTiming({
  spec,
  onChange,
}: {
  spec: ScheduleSpec;
  onChange: (spec: ScheduleSpec) => void;
}) {
  return (
    <>
      <div className="schedule-cadence" role="group" aria-label="Schedule type">
        {(
          [
            {
              kind: "daily",
              icon: CalendarDays,
              label: "At a set time",
              detail: "Your days, your routine",
            },
            {
              kind: "interval",
              icon: Repeat2,
              label: "Every so often",
              detail: "Minutes, hours, or days",
            },
            {
              kind: "cron",
              icon: Code2,
              label: "Custom timing",
              detail: "An advanced cron schedule",
            },
          ] as const
        ).map(({ kind, icon: Icon, label, detail }) => (
          <button
            type="button"
            key={kind}
            className={spec.kind === kind ? "is-selected" : ""}
            aria-pressed={spec.kind === kind}
            onClick={() =>
              onChange(
                kind === "daily"
                  ? { kind, time: "09:00", days: [1, 2, 3, 4, 5] }
                  : kind === "interval"
                    ? { kind, everyMinutes: 60 }
                    : { kind, expr: "0 9 * * 1-5" },
              )
            }
          >
            <Icon size={17} />
            <strong>{label}</strong>
            <span>{detail}</span>
          </button>
        ))}
      </div>
      {spec.kind === "daily" && (
        <div className="profile-stack" style={{ marginBottom: 21 }}>
          <div className="profile-form-grid">
            <Field label="Time of day">
              <input
                type="time"
                value={spec.time}
                onChange={(event) =>
                  onChange({ ...spec, time: event.target.value })
                }
              />
            </Field>
            <Field label="Quick pick">
              <div className="profile-choice-group">
                <button
                  type="button"
                  className={
                    spec.days.join(",") === "1,2,3,4,5" ? "is-selected" : ""
                  }
                  onClick={() => onChange({ ...spec, days: [1, 2, 3, 4, 5] })}
                >
                  Weekdays
                </button>
                <button
                  type="button"
                  className={spec.days.length === 7 ? "is-selected" : ""}
                  onClick={() =>
                    onChange({ ...spec, days: [0, 1, 2, 3, 4, 5, 6] })
                  }
                >
                  Every day
                </button>
              </div>
            </Field>
          </div>
          <Field label="Days of the week">
            <div
              className="schedule-weekdays"
              role="group"
              aria-label="Days of the week"
            >
              {DAY_LABELS.map((label, index) => (
                <button
                  type="button"
                  key={label}
                  className={spec.days.includes(index) ? "is-selected" : ""}
                  aria-pressed={spec.days.includes(index)}
                  onClick={() =>
                    onChange({
                      ...spec,
                      days: spec.days.includes(index)
                        ? spec.days.filter((day) => day !== index)
                        : [...spec.days, index].sort(),
                    })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      )}
      {spec.kind === "interval" && (
        <div className="profile-stack" style={{ marginBottom: 21 }}>
          <Field label="Repeat every (minutes)">
            <input
              type="number"
              min={1}
              max={10080}
              value={spec.everyMinutes}
              onChange={(event) =>
                onChange({ ...spec, everyMinutes: Number(event.target.value) })
              }
            />
          </Field>
          <div className="profile-choice-group" aria-label="Interval presets">
            {[
              [15, "15 minutes"],
              [30, "30 minutes"],
              [60, "1 hour"],
              [240, "4 hours"],
              [1440, "1 day"],
            ].map(([minutes, label]) => (
              <button
                type="button"
                key={minutes}
                className={spec.everyMinutes === minutes ? "is-selected" : ""}
                onClick={() =>
                  onChange({ ...spec, everyMinutes: Number(minutes) })
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {spec.kind === "cron" && (
        <Field
          label="Cron expression"
          hint="Five fields: minute, hour, day, month, weekday. For example, 0 9 * * 1-5 means weekdays at 9:00."
          className="profile-stack"
        >
          <input
            value={spec.expr}
            onChange={(event) =>
              onChange({ ...spec, expr: event.target.value })
            }
            placeholder="0 9 * * 1-5"
            style={{ fontFamily: "var(--font-mono)", marginBottom: 12 }}
          />
        </Field>
      )}
    </>
  );
}
