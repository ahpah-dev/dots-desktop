import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  Plus,
  RotateCcw,
  Square,
  Users,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TeamJob, TeamStepInput } from "@shared/types";
import { useApp } from "../context/AppContext";
import { DotAvatar } from "./DotAvatar";
import { Field, PanelSection, errorMessage } from "./PanelPrimitives";
import "../teamwork.css";

const modes = [
  {
    id: "parallel",
    label: "Work in parallel",
    description: "Independent assignments, then one combined answer.",
  },
  {
    id: "relay",
    label: "Pass the work along",
    description: "Each dot builds on the previous result.",
  },
  {
    id: "review",
    label: "Create & review",
    description: "The last dot checks the others before the lead combines.",
  },
] as const;
type Mode = (typeof modes)[number]["id"];
const statusLabel = (status: string) =>
  ({
    pending: "Waiting for dependencies",
    queued: "Queued",
    running: "Working",
    "awaiting-approval": "Needs your approval",
    synthesizing: "Combining results",
    succeeded: "Completed",
    failed: "Needs attention",
    interrupted: "Interrupted",
    cancelled: "Stopped",
  })[status] || status;
const running = (job: TeamJob) =>
  ["running", "synthesizing"].includes(job.status);
const tokenCount = (job: TeamJob) =>
  job.usage.inputTokens + job.usage.outputTokens;
const mergeJobs = (current: TeamJob[], incoming: TeamJob[]) => {
  const map = new Map(current.map((job) => [job.id, job]));
  incoming.forEach((job) => {
    if ((map.get(job.id)?.updatedAt || 0) <= job.updatedAt)
      map.set(job.id, job);
  });
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
};

export function TeamworkPage() {
  const { bootstrap, openDot, setView, setShowNewDotModal, showToast } =
    useApp();
  const dots = bootstrap?.dots || [];
  const eligible = dots.filter(
    (dot) => !dot.paused && dot.permissions.talkToDots,
  );
  const [jobs, setJobs] = useState<TeamJob[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [members, setMembers] = useState<string[]>(() =>
    eligible.slice(0, 2).map((dot) => dot.id),
  );
  const [lead, setLead] = useState(() => eligible[0]?.id || "");
  const [mode, setMode] = useState<Mode>("parallel");
  const [title, setTitle] = useState("");
  const [goal, setGoal] = useState("");
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [maxTokens, setMaxTokens] = useState(60000);
  const [additionalTokens, setAdditionalTokens] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    let alive = true;
    const off = window.dots.onEvent((event) => {
      if (event.type === "team-job")
        setJobs((current) => mergeJobs(current, [event.job]));
    });
    window.dots.api
      .listTeamJobs()
      .then((value) => {
        if (alive) setJobs((current) => mergeJobs(current, value));
      })
      .catch((error) => {
        if (alive)
          setLoadError(errorMessage(error, "Could not load team tasks."));
      });
    return () => {
      alive = false;
      off();
    };
  }, []);
  const participants = members
    .map((id) => eligible.find((dot) => dot.id === id))
    .filter((dot) => dot !== undefined);
  const selectedLead = members.includes(lead)
    ? lead
    : participants[0]?.id || "";
  const job = jobs.find((item) => item.id === selected);
  const defaultAssignment = (index: number) =>
    mode === "review" && index === participants.length - 1
      ? "Review the other results. Check accuracy, identify gaps and risks, and suggest concrete improvements."
      : mode === "relay" && index > 0
        ? "Build on the previous result. Improve the work using your expertise and report a useful next version."
        : `Contribute to the goal using your expertise${participants[index]?.description ? `: ${participants[index].description}` : ""}. Produce a useful result with evidence, and state any limitations.`;
  const steps: TeamStepInput[] = participants.map((dot, index) => ({
    id: `step-${index + 1}`,
    dotId: dot.id,
    title:
      mode === "review" && index === participants.length - 1
        ? "Review"
        : `Contribution ${index + 1}`,
    prompt: assignments[dot.id] ?? defaultAssignment(index),
    dependsOn:
      mode === "relay" && index > 0
        ? [`step-${index}`]
        : mode === "review" && index === participants.length - 1
          ? participants.slice(0, -1).map((_, index) => `step-${index + 1}`)
          : [],
  }));
  const perform = async (action: () => Promise<TeamJob>) => {
    setBusy(true);
    try {
      const value = await action();
      setJobs((current) => mergeJobs(current, [value]));
      setSelected(value.id);
    } catch (error) {
      showToast(
        errorMessage(error, "This team task could not be updated."),
        "error",
      );
    } finally {
      setBusy(false);
    }
  };
  const start = () =>
    void perform(() =>
      window.dots.api.startTeamJob({
        title: title.trim() || goal.trim().split("\n")[0].slice(0, 100),
        goal,
        leadDotId: selectedLead,
        steps,
        maxTokens,
      }),
    );
  return (
    <main className="studio-page teamwork-page">
      <header className="page-topbar">
        <span>Your team</span>
        <span className="topbar-status">
          <Users size={15} /> {jobs.filter(running).length} active team tasks
        </span>
      </header>
      <div className="page-inner">
        <div className="overview-heading">
          <div>
            <span className="eyebrow">BETTER TOGETHER</span>
            <h1>One goal. A team of dots.</h1>
            <p>
              Give everyone a clear part, then let your lead bring it together.
            </p>
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              setSelected(null);
              setAdditionalTokens(0);
            }}
          >
            <Plus size={15} /> New team task
          </button>
        </div>
        {loadError && (
          <p className="provider-result error" role="alert">
            {loadError}
          </p>
        )}
        <div className="team-layout">
          <aside className="team-history" aria-label="Team tasks">
            <h3>
              Team tasks <span>{jobs.length}</span>
            </h3>
            {!jobs.length && (
              <p>
                Your first team task starts here. Each dot keeps its own model,
                workspace, and permissions.
              </p>
            )}
            {jobs.map((item) => (
              <button
                key={item.id}
                className={`team-history-item ${selected === item.id ? "selected" : ""}`}
                onClick={() => {
                  setSelected(item.id);
                  setAdditionalTokens(0);
                }}
              >
                <strong>{item.title}</strong>
                <span>
                  <i
                    className={`status-dot status-${running(item) ? "running" : item.status === "succeeded" ? "idle" : "paused"}`}
                  />
                  {statusLabel(item.status)}
                </span>
                <small>
                  {
                    item.steps.filter((step) => step.status === "succeeded")
                      .length
                  }
                  /{item.steps.length} assignments ·{" "}
                  {tokenCount(item).toLocaleString()} tokens
                </small>
              </button>
            ))}
          </aside>
          <div className="team-main">
            {job ? (
              <>
                {job.result && (
                  <PanelSection title="Team result">
                    <div className="markdown-body team-result">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              onClick={(event) => {
                                event.preventDefault();
                                if (href && /^https?:/i.test(href))
                                  void window.dots.api.openExternal(href);
                              }}
                            >
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {job.result}
                      </ReactMarkdown>
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        void window.dots.api
                          .writeClipboardText(job.result!)
                          .then(() =>
                            showToast("Team result copied.", "success"),
                          )
                          .catch(() =>
                            showToast("Could not copy the result.", "error"),
                          );
                      }}
                    >
                      Copy result
                    </button>
                  </PanelSection>
                )}
                <PanelSection title={job.title} description={job.goal}>
                  <div className="team-progress">
                    <span className={`team-status status-${job.status}`}>
                      {statusLabel(job.status)}
                    </span>
                    <span>
                      {job.usage.estimated ? "≈ " : ""}
                      {tokenCount(job).toLocaleString()} /{" "}
                      {job.maxTokens.toLocaleString()} tokens
                      {job.usage.cachedTokens
                        ? ` · ${job.usage.cachedTokens.toLocaleString()} cached`
                        : ""}
                    </span>
                  </div>
                  <progress
                    aria-label="Completed team assignments"
                    value={
                      job.steps.filter((step) => step.status === "succeeded")
                        .length + (job.status === "succeeded" ? 1 : 0)
                    }
                    max={job.steps.length + 1}
                  />
                  {job.error && (
                    <p className="provider-result error" role="status">
                      {job.error}
                    </p>
                  )}
                  <div className="team-step-list">
                    {job.steps.map((step) => {
                      const dot = dots.find((dot) => dot.id === step.dotId);
                      return (
                        <article key={step.id} className="team-step">
                          <div className="team-step-heading">
                            {dot && <DotAvatar dot={dot} size={34} />}
                            <div>
                              <strong>
                                {step.title} · {dot?.name || "Removed dot"}
                              </strong>
                              <small>{statusLabel(step.status)}</small>
                            </div>
                            {step.status === "succeeded" ? (
                              <CheckCircle2 size={17} />
                            ) : ["running", "awaiting-approval"].includes(
                                step.status,
                              ) ? (
                              <Loader2 size={17} className="spin" />
                            ) : (
                              <span className="team-step-order">
                                {job.steps.indexOf(step) + 1}
                              </span>
                            )}
                          </div>
                          {!!step.dependsOn.length && (
                            <small>
                              After{" "}
                              {step.dependsOn
                                .map(
                                  (id) =>
                                    job.steps.find((item) => item.id === id)
                                      ?.title,
                                )
                                .join(", ")}
                            </small>
                          )}
                          {step.error && (
                            <p className="provider-result error">
                              {step.error}
                            </p>
                          )}
                          {step.result && (
                            <details>
                              <summary>Read contribution</summary>
                              <div className="team-contribution">
                                {step.result}
                              </div>
                            </details>
                          )}
                          {step.runId && dot && (
                            <button
                              className="btn-ghost"
                              onClick={() => openDot(step.dotId, step.runId!)}
                            >
                              Open conversation <ArrowRight size={13} />
                            </button>
                          )}
                        </article>
                      );
                    })}
                  </div>
                  <div className="team-lead">
                    <Users size={17} />
                    <span>
                      {dots.find((dot) => dot.id === job.leadDotId)?.name ||
                        "Lead dot"}{" "}
                      {job.status === "succeeded"
                        ? "combined the results."
                        : job.status === "synthesizing"
                          ? "is combining the results…"
                          : "will combine the completed results."}
                    </span>
                    {job.synthesisRunId && (
                      <button
                        className="btn-ghost"
                        onClick={() =>
                          openDot(job.leadDotId, job.synthesisRunId!)
                        }
                      >
                        Open lead
                      </button>
                    )}
                  </div>
                  {running(job) ? (
                    <button
                      className="btn-secondary"
                      disabled={busy}
                      onClick={() =>
                        void perform(() =>
                          window.dots.api.cancelTeamJob(job.id),
                        )
                      }
                    >
                      <Square size={13} /> Stop team task
                    </button>
                  ) : (
                    job.status !== "succeeded" && (
                      <div className="team-resume">
                        <Field
                          label="Additional token allowance"
                          hint="Completed assignments are kept. Only unfinished work runs again."
                        >
                          <input
                            type="number"
                            min={0}
                            max={2000000 - job.maxTokens}
                            value={additionalTokens}
                            onChange={(event) =>
                              setAdditionalTokens(Number(event.target.value))
                            }
                          />
                        </Field>
                        <button
                          className="btn-primary"
                          disabled={busy}
                          onClick={() =>
                            void perform(() =>
                              window.dots.api.resumeTeamJob(
                                job.id,
                                additionalTokens,
                              ),
                            )
                          }
                        >
                          <RotateCcw size={14} /> Resume unfinished work
                        </button>
                      </div>
                    )
                  )}
                </PanelSection>
              </>
            ) : (
              <>
                {eligible.length < 2 && (
                  <div className="team-onboarding">
                    <Users size={24} />
                    <h3>Bring two dots together</h3>
                    <p>
                      Team tasks need at least two resumed dots with “Talk to
                      other dots” enabled. Each can use a different model
                      provider.
                    </p>
                    <div className="profile-actions">
                      <button
                        className="btn-primary"
                        onClick={() => setShowNewDotModal(true)}
                      >
                        <Plus size={14} /> Create a dot
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => setView("connections")}
                      >
                        Set up providers
                      </button>
                    </div>
                  </div>
                )}
                <PanelSection title="What should the team accomplish?">
                  <Field
                    label="Goal"
                    hint="Describe the outcome, useful context, and how to judge the result."
                  >
                    <textarea
                      rows={4}
                      maxLength={12000}
                      value={goal}
                      onChange={(event) => setGoal(event.target.value)}
                      placeholder="Research a feature, prepare a proposal, and check its risks…"
                    />
                  </Field>
                  <Field label="Task name (optional)">
                    <input
                      maxLength={120}
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="A short name for this work"
                    />
                  </Field>
                </PanelSection>
                <PanelSection
                  title="Choose your team"
                  description="Every dot works with its own provider and permissions. Up to eight assignments."
                >
                  <div className="team-members">
                    {dots.map((dot) => {
                      const enabled =
                        !dot.paused && !!dot.permissions.talkToDots;
                      return (
                        <button
                          key={dot.id}
                          className={`team-member ${members.includes(dot.id) ? "selected" : ""}`}
                          aria-pressed={members.includes(dot.id)}
                          disabled={
                            !enabled ||
                            (!members.includes(dot.id) && members.length >= 8)
                          }
                          onClick={() =>
                            setMembers((current) =>
                              current.includes(dot.id)
                                ? current.filter((id) => id !== dot.id)
                                : [...current, dot.id],
                            )
                          }
                        >
                          <DotAvatar dot={dot} size={32} />
                          <span>
                            <strong>{dot.name}</strong>
                            <small>
                              {dot.paused
                                ? "Paused"
                                : !dot.permissions.talkToDots
                                  ? "Messaging disabled"
                                  : dot.model === "auto"
                                    ? "Provider default"
                                    : dot.model}
                            </small>
                          </span>
                          {members.includes(dot.id) && (
                            <CheckCircle2 size={15} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <Field
                    label="Lead dot"
                    hint="The lead combines all completed contributions into one answer."
                  >
                    <select
                      value={selectedLead}
                      onChange={(event) => setLead(event.target.value)}
                      disabled={!participants.length}
                    >
                      {!participants.length && (
                        <option value="">Select your team first</option>
                      )}
                      {participants.map((dot) => (
                        <option key={dot.id} value={dot.id}>
                          {dot.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </PanelSection>
                <PanelSection title="How should they work?">
                  <div className="token-presets team-modes">
                    {modes.map((item) => (
                      <button
                        key={item.id}
                        className={`token-preset ${mode === item.id ? "selected" : ""}`}
                        aria-pressed={mode === item.id}
                        onClick={() => {
                          setMode(item.id);
                          setAssignments({});
                        }}
                      >
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </button>
                    ))}
                  </div>
                  <div className="team-assignments">
                    {participants.map((dot, index) => (
                      <Field
                        key={dot.id}
                        label={`${index + 1}. ${dot.name}'s assignment`}
                        hint={
                          steps[index].dependsOn.length
                            ? "Receives the completed results from earlier assignments."
                            : "Can work independently alongside the other dots."
                        }
                      >
                        <textarea
                          rows={3}
                          maxLength={6000}
                          value={steps[index].prompt}
                          onChange={(event) =>
                            setAssignments((current) => ({
                              ...current,
                              [dot.id]: event.target.value,
                            }))
                          }
                        />
                      </Field>
                    ))}
                  </div>
                </PanelSection>
                <PanelSection title="Keep the work bounded">
                  <Field
                    label="Team token allowance"
                    hint="Shared across contributions and the final answer. Per-dot limits also apply. Provider usage is used when available; otherwise counts are estimated."
                  >
                    <input
                      type="number"
                      min={8000}
                      max={2000000}
                      step={1000}
                      value={maxTokens}
                      onChange={(event) =>
                        setMaxTokens(Number(event.target.value))
                      }
                    />
                  </Field>
                  <p className="budget-hint">
                    Parallel work follows your concurrency setting. Results are
                    passed as concise context, so dots do not repeatedly message
                    or poll each other. The allowance stops new work; provider
                    reporting can lag behind usage.
                  </p>
                  <button
                    className="btn-primary team-start"
                    disabled={
                      busy ||
                      participants.length < 2 ||
                      !goal.trim() ||
                      steps.some((step) => !step.prompt.trim()) ||
                      maxTokens < 8000 ||
                      maxTokens > 2000000
                    }
                    onClick={start}
                  >
                    {busy ? (
                      <Loader2 size={15} className="spin" />
                    ) : (
                      <Users size={15} />
                    )}{" "}
                    Start team task
                  </button>
                </PanelSection>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
