import { useEffect, useState } from "react";
import {
  Save,
  Trash2,
  RotateCcw,
  Folder,
  Shield,
  Cpu,
  Palette,
  Monitor,
  Globe,
  MessageSquare,
  Plus,
  Info,
  Loader2,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  DotPatch,
  DotSummary,
  ModelInfo,
  PermissionRule,
} from "@shared/types";
import { CODEX_PROVIDER_ID } from "@shared/types";
import { normalizeBudget, TOKEN_PRESETS } from "@shared/budget";
import { groupModels } from "@shared/models";
import { AvatarEditor, DotAvatar, normalizeAvatar } from "./DotAvatar";
import {
  Field,
  PanelHeader,
  PanelSection,
  SettingRow,
  Toggle,
  errorMessage,
} from "./PanelPrimitives";

const RULE_TOOLS = [
  ["*", "All tools"],
  ["run_command", "Commands"],
  ["list_files", "List files"],
  ["read_file", "Read files"],
  ["search_files", "Search files"],
  ["write_file", "Write files"],
  ["edit_file", "Edit files"],
  ["web_search", "Web search"],
  ["web_fetch", "Fetch websites"],
  ["browse_page", "Browse websites"],
  ["remember", "Memory"],
  ["schedule_followup", "Schedule follow-up"],
  ["list_dots", "Find teammates"],
  ["send_dot_message", "Message teammates"],
];

function draftFor(dot: DotSummary | null) {
  return {
    name: dot?.name || "",
    description: dot?.description || "",
    color: dot?.color || "#78b7a0",
    avatar: normalizeAvatar(dot?.avatar),
    instructions: dot?.instructions || "",
    workspacePath: dot?.workspacePath || "",
    providerId: dot?.providerId || CODEX_PROVIDER_ID,
    model: dot?.model || "auto",
    reasoningEffort: dot?.reasoningEffort || "low",
    notify: dot?.notify ?? true,
    permissions: dot?.permissions
      ? { ...dot.permissions, talkToDots: dot.permissions.talkToDots !== false, rules: [...(dot.permissions.rules || [])] }
      : {
          files: "write" as const,
          shell: true,
          web: true,
          talkToDots: true,
          outsideWorkspace: false,
          approval: "ask" as const,
          rules: [] as PermissionRule[],
        },
    budget: normalizeBudget(dot?.budget),
  };
}

export function DotSettings({ dotId }: { dotId: string }) {
  const {
    activeDot,
    providerOptions,
    showToast,
    refreshBootstrap,
    setShowSettingsModal,
  } = useApp();
  const [draft, setDraft] = useState(() => draftFor(activeDot));
  const [tab, setTab] = useState<"profile" | "permissions" | "runtime">(
    "profile",
  );
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelError, setModelError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteWorkspace, setDeleteWorkspace] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    setDraft(draftFor(activeDot));
    setDeleteOpen(false);
    setDeleteName("");
    setDeleteWorkspace(false);
  }, [dotId, activeDot?.id]);
  useEffect(() => {
    let current = true;
    setLoadingModels(true);
    setModels([]);
    setModelError("");
    window.dots.api
      .listModels(draft.providerId)
      .then((result) => {
        if (current) setModels(result);
      })
      .catch((error: unknown) => {
        if (current)
          setModelError(
            errorMessage(
              error,
              "Could not load models. You can enter a model ID.",
            ),
          );
      })
      .finally(() => {
        if (current) setLoadingModels(false);
      });
    return () => {
      current = false;
    };
  }, [draft.providerId]);
  const update = <K extends keyof typeof draft>(
    key: K,
    value: (typeof draft)[K],
  ) => setDraft((previous) => ({ ...previous, [key]: value }));
  const permission = <K extends keyof typeof draft.permissions>(
    key: K,
    value: (typeof draft.permissions)[K],
  ) =>
    setDraft((previous) => ({
      ...previous,
      permissions: { ...previous.permissions, [key]: value },
    }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFor(activeDot));
  const provider = providerOptions.find((item) => item.id === draft.providerId);
  const selectedModel = models.find((item) => item.id === draft.model);
  const efforts = selectedModel?.reasoningEfforts?.length
    ? selectedModel.reasoningEfforts
    : ["low", "medium", "high", "max"];
  const handleSave = async () => {
    if (!draft.name.trim()) {
      showToast("Give your dot a name.", "error");
      return;
    }
    try {
      setSaving(true);
      const patch: DotPatch = {
        ...draft,
        name: draft.name.trim(),
        description: draft.description.trim(),
        workspacePath: draft.workspacePath.trim(),
        model: draft.model.trim() || "auto",
        permissions: {
          ...draft.permissions,
          rules: draft.permissions.rules.map((rule) => ({
            ...rule,
            pattern: rule.pattern?.trim() || undefined,
          })),
        },
        budget: normalizeBudget(draft.budget),
      };
      if (draft.workspacePath.trim() === activeDot?.workspacePath) {
        delete patch.workspacePath;
      }
      const saved = await window.dots.api.updateDot(dotId, patch);
      setDraft(draftFor(saved));
      await refreshBootstrap();
      showToast("Your dot’s profile is saved.", "success");
    } catch (error) {
      showToast(errorMessage(error, "Could not save this profile."), "error");
    } finally {
      setSaving(false);
    }
  };
  const pickFolder = async () => {
    try {
      const chosen = await window.dots.api.pickFolder(draft.workspacePath);
      if (chosen) update("workspacePath", chosen);
    } catch (error) {
      showToast(errorMessage(error, "Could not choose a folder."), "error");
    }
  };
  const reset = async () => {
    if (
      !confirm(
        `Start a fresh provider session for ${activeDot?.name}? Saved activity, memory, and workspace files remain available.`,
      )
    )
      return;
    try {
      setResetting(true);
      await window.dots.api.resetDotSession(dotId);
      await refreshBootstrap();
      showToast("The next task will start a fresh session.", "success");
    } catch (error) {
      showToast(errorMessage(error, "Could not reset the session."), "error");
    } finally {
      setResetting(false);
    }
  };
  const remove = async () => {
    if (deleteName !== activeDot?.name) return;
    try {
      setDeleting(true);
      await window.dots.api.deleteDot(dotId, deleteWorkspace);
      await refreshBootstrap();
      showToast("Dot deleted.", "info");
    } catch (error) {
      showToast(errorMessage(error, "Could not delete this dot."), "error");
    } finally {
      setDeleting(false);
    }
  };
  const patchRule = (id: string, patch: Partial<PermissionRule>) =>
    permission(
      "rules",
      draft.permissions.rules.map((rule) =>
        rule.id === id ? { ...rule, ...patch } : rule,
      ),
    );
  return (
    <div className="profile-panel">
      <PanelHeader
        eyebrow="Make it your own"
        title="Your dot’s profile"
        description="A familiar face, clear instructions, and the right tools for the work you share."
        actions={
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty || !draft.name.trim()}
          >
            {saving ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}{" "}
            {saving ? "Saving…" : "Save changes"}
          </button>
        }
      />
      <nav className="profile-tabs" aria-label="Profile sections">
        {(
          [
            { id: "profile", label: "Personalization", icon: Palette },
            { id: "permissions", label: "Permissions", icon: Shield },
            { id: "runtime", label: "Model & computer", icon: Cpu },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={tab === id ? "is-active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>
      {tab === "profile" && (
        <>
          <PanelSection
            title="A little personality"
            description="Choose a look that feels like your dot. You can change it anytime."
          >
            <AvatarEditor
              value={draft.avatar}
              color={draft.color}
              onChange={(value) => update("avatar", value)}
              onColorChange={(value) => update("color", value)}
            />
          </PanelSection>
          <PanelSection title="Getting to know each other">
            <div className="profile-stack">
              <div className="profile-identity">
                <DotAvatar
                  avatar={draft.avatar}
                  color={draft.color}
                  name={draft.name}
                  size={64}
                />
                <Field label="Name">
                  <input
                    value={draft.name}
                    onChange={(event) => update("name", event.target.value)}
                    maxLength={80}
                    placeholder="Give your dot a name"
                  />
                  <span className="profile-handle">
                    @
                    {draft.name
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, "") || "your"}
                    -dot
                  </span>
                </Field>
              </div>
              <Field label="About your dot">
                <input
                  value={draft.description}
                  onChange={(event) =>
                    update("description", event.target.value)
                  }
                  placeholder="A thoughtful partner for your projects"
                  maxLength={300}
                />
              </Field>
              <Field
                label="How you’d like to work together"
                hint="Share your priorities, preferences, and what should always get your attention."
              >
                <textarea
                  value={draft.instructions}
                  onChange={(event) =>
                    update("instructions", event.target.value)
                  }
                  rows={5}
                  placeholder="Keep me informed when something needs a decision. Be concise, verify your work, and remember what we learn."
                />
              </Field>
            </div>
            <div style={{ marginTop: 22 }}>
              <SettingRow
                title="Let me know when work needs me"
                description="Send a desktop notification when a task finishes or needs approval. App notifications also need to be enabled."
              >
                <Toggle
                  checked={draft.notify}
                  label="Dot notifications"
                  onChange={(value) => update("notify", value)}
                />
              </SettingRow>
            </div>
          </PanelSection>
          <PanelSection
            title="Connections"
            description="Your dot works through the access available in this desktop app."
          >
            <div className="profile-connections">
              <div className="profile-connection">
                <Monitor size={18} />
                <div>
                  <strong>
                    This computer{" "}
                    <span className="profile-tag is-green">Local</span>
                  </strong>
                  <p>
                    Your workspace and enabled tools are available while Dots is
                    running.
                  </p>
                </div>
              </div>
              <div className="profile-connection">
                <Cpu size={18} />
                <div>
                  <strong>{provider?.label || "Model provider"}</strong>
                  <p>
                    {provider?.available
                      ? "Connected and available for tasks."
                      : provider?.reason ||
                        "Connect a provider in app settings."}
                  </p>
                  {!provider?.available && (
                    <button
                      className="profile-text-button"
                      onClick={() => setShowSettingsModal(true)}
                    >
                      Open account settings
                    </button>
                  )}
                </div>
              </div>
              <div className="profile-connection">
                <Globe size={18} />
                <div>
                  <strong>Web research</strong>
                  <p>
                    {draft.permissions.web
                      ? "Search and browse tools enabled."
                      : "Web tools are disabled in permissions."}
                  </p>
                </div>
              </div>
              <div className="profile-connection">
                <MessageSquare size={18} />
                <div>
                  <strong>Other dots</strong>
                  <p>{draft.permissions.talkToDots ? "Can send requests to enabled teammates and receive their replies in the conversation." : "Enable Talk to other dots in Permissions to work with teammates."}</p>
                </div>
              </div>
              <div className="profile-connection">
                <MessageSquare size={18} />
                <div>
                  <strong>Slack, Teams & calls</strong>
                  <p>
                    Not connected. This local app does not provide hosted
                    messaging or voice channels.
                  </p>
                </div>
              </div>
            </div>
          </PanelSection>
        </>
      )}
      {tab === "permissions" && (
        <>
          <PanelSection
            title="Tools and access"
            description="Give your dot the access it needs for its responsibilities."
          >
            <SettingRow
              title="Workspace files"
              description="Read existing files, or allow creating and editing files in the workspace."
            >
              <select
                aria-label="Workspace file access"
                value={draft.permissions.files}
                onChange={(event) =>
                  permission("files", event.target.value as "read" | "write")
                }
              >
                <option value="write">Read & write</option>
                <option value="read">Read only</option>
              </select>
            </SettingRow>
            <SettingRow
              title="Run commands"
              description={draft.providerId === CODEX_PROVIDER_ID ? "Use tools such as Git, project builds, tests, and scripts within Codex’s sandbox." : "Run commands on this computer. Compatible-provider commands are not isolated by an operating-system sandbox and can access files beyond the workspace."}
            >
              <Toggle
                label="Run shell commands"
                checked={draft.permissions.shell}
                onChange={(value) => permission("shell", value)}
              />
            </SettingRow>
            <SettingRow
              title="Search and browse the web"
              description="Research live information and read websites."
            >
              <Toggle
                label="Web access"
                checked={draft.permissions.web}
                onChange={(value) => permission("web", value)}
              />
            </SettingRow>
            <SettingRow
              title="Talk to other dots"
              description="Enabled by default. Ask your dot to consult a teammate by name and receive the answer here. Each dot uses its own permissions and task budget. Turn this off to stop this dot from exchanging messages."
            >
              <Toggle label="Talk to other dots" checked={draft.permissions.talkToDots} onChange={(value) => permission("talkToDots", value)} />
            </SettingRow>
            <SettingRow
              title="File access outside the workspace"
              description="Allow file tools beyond this dot’s dedicated folder. For Codex, this also expands its sandbox access."
            >
              <Toggle
                label="Access outside workspace"
                checked={draft.permissions.outsideWorkspace}
                onChange={(value) => permission("outsideWorkspace", value)}
              />
            </SettingRow>
            <SettingRow
              title="Action review"
              description="For compatible API providers, ask before commands and file changes."
            >
              <select
                aria-label="Action review policy"
                value={draft.permissions.approval}
                onChange={(event) =>
                  permission("approval", event.target.value as "ask" | "never")
                }
              >
                <option value="ask">Ask before taking action</option>
                <option value="never">Proceed within permissions</option>
              </select>
            </SettingRow>
          </PanelSection>
          <PanelSection
            title="Custom rules"
            description="Apply a rule to a tool, optionally matching a phrase in its arguments."
          >
            <div className="profile-rule profile-rule-header">
              <span>Tool</span>
              <span>Behavior</span>
              <span>Match text (optional)</span>
            </div>
            {draft.permissions.rules.map((rule) => (
              <div className="profile-rule" key={rule.id}>
                <select
                  aria-label="Rule tool"
                  value={rule.action}
                  onChange={(event) =>
                    patchRule(rule.id, { action: event.target.value })
                  }
                >
                  {RULE_TOOLS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                  {!RULE_TOOLS.some(([id]) => id === rule.action) && <option value={rule.action}>{rule.action}</option>}
                </select>
                <select
                  aria-label="Rule behavior"
                  value={rule.effect}
                  onChange={(event) =>
                    patchRule(rule.id, {
                      effect: event.target.value as PermissionRule["effect"],
                    })
                  }
                >
                  <option value="ask">Ask first</option>
                  <option value="allow">Allow</option>
                  <option value="deny">Prevent</option>
                </select>
                <input
                  aria-label="Match text"
                  value={rule.pattern || ""}
                  placeholder="e.g. delete or production"
                  onChange={(event) =>
                    patchRule(rule.id, { pattern: event.target.value })
                  }
                />
                <button
                  className="btn-ghost profile-icon-button"
                  aria-label="Remove rule"
                  onClick={() =>
                    permission(
                      "rules",
                      draft.permissions.rules.filter(
                        (item) => item.id !== rule.id,
                      ),
                    )
                  }
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button
              className="btn-secondary"
              disabled={draft.permissions.rules.length >= 50}
              style={{ marginTop: 7 }}
              onClick={() =>
                permission("rules", [
                  ...draft.permissions.rules,
                  { id: crypto.randomUUID(), action: "*", effect: "ask" },
                ])
              }
            >
              <Plus size={13} /> Add rule
            </button>
          </PanelSection>
          <div className="profile-note">
            <Info size={16} />
            <div>
              <strong>
                {draft.providerId === CODEX_PROVIDER_ID
                  ? "Codex permission behavior"
                  : "Rules stay within enabled permissions"}
              </strong>
              <br />
              {draft.providerId === CODEX_PROVIDER_ID
                ? "Codex runs with its own sandbox and cannot enforce this app’s per-tool review. Codex tasks are blocked when Ask before taking action or a custom Ask/Prevent rule is selected. Choose Proceed within permissions and remove those rules, or switch to a compatible API provider to use them."
                : "Custom rules cannot enable a disabled tool or expand folder access. Review requests appear with the task’s activity."}
            </div>
          </div>
        </>
      )}
      {tab === "runtime" && (
        <>
          <PanelSection
            title="Model and reasoning"
            description="Use your connected account or a compatible API provider."
          >
            <div className="profile-stack">
              <Field label="Provider">
                <select
                  value={draft.providerId}
                  onChange={(event) => {
                    update("providerId", event.target.value);
                    update("model", "auto");
                  }}
                >
                  {providerOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {!item.available ? " · Unavailable" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {provider && !provider.available && (
                <div className="profile-note is-warning">
                  <Info size={15} />
                  <div>
                    {provider.reason || "This provider is not connected."}{" "}
                    <button
                      className="profile-text-button"
                      onClick={() => setShowSettingsModal(true)}
                    >
                      Connect in settings
                    </button>
                  </div>
                </div>
              )}
              <div className="profile-form-grid">
                <Field label={loadingModels ? "Model · Loading…" : "Model"}>
                  <select
                    value={draft.model}
                    onChange={(event) => update("model", event.target.value)}
                  >
                    <option value="auto">
                      Automatic · Provider recommended
                    </option>
                    {groupModels(models).map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.models.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                            {item.isDefault ? " · Default" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    {draft.model !== "auto" &&
                      !models.some((item) => item.id === draft.model) && (
                        <option value={draft.model}>
                          {draft.model} · Custom
                        </option>
                      )}
                  </select>
                </Field>
                <Field
                  label="Custom model ID"
                  hint="Use an ID supported by the selected provider."
                >
                  <input
                    value={draft.model === "auto" ? "" : draft.model}
                    placeholder="Provider default"
                    onChange={(event) =>
                      update("model", event.target.value.trim() || "auto")
                    }
                  />
                </Field>
              </div>
              {modelError && <p className="settings-error">{modelError}</p>}
              {selectedModel?.description && (
                <p className="profile-count" style={{ lineHeight: 1.7 }}>
                  {selectedModel.description}
                </p>
              )}
              <Field label="Reasoning effort">
                <div
                  className="profile-choice-group"
                  role="group"
                  aria-label="Reasoning effort"
                >
                  {[...new Set([...efforts, draft.reasoningEffort])].map(
                    (effort) => (
                      <button
                        type="button"
                        key={effort}
                        aria-pressed={draft.reasoningEffort === effort}
                        className={
                          draft.reasoningEffort === effort ? "is-selected" : ""
                        }
                        onClick={() => update("reasoningEffort", effort)}
                      >
                        {effort.charAt(0).toUpperCase() + effort.slice(1)}
                      </button>
                    ),
                  )}
                </div>
              </Field>
            </div>
          </PanelSection>
          <PanelSection
            title="A place for your work"
            description="Your dot keeps its project files in a dedicated folder on this computer."
          >
            <Field label="Workspace folder">
              <div className="profile-inline">
                <input
                  value={draft.workspacePath}
                  onChange={(event) =>
                    update("workspacePath", event.target.value)
                  }
                />
                <button className="btn-secondary" onClick={pickFolder}>
                  <Folder size={14} /> Browse
                </button>
              </div>
            </Field>
            <div className="profile-note" style={{ marginTop: 16 }}>
              <Monitor size={15} />
              <div>
                Keep this computer on and Dots running for scheduled work.
                Closing to the system tray is supported when background mode is
                enabled.
              </div>
            </div>
          </PanelSection>
          <PanelSection title="Work style & limits" description="Choose how much your dot investigates and verifies. Automatic runs keep working until the task is complete.">
            <div className="token-presets">{TOKEN_PRESETS.map(preset => <button key={preset.id} className={`token-preset ${draft.budget.workStyle === preset.id ? 'selected' : ''}`} aria-pressed={draft.budget.workStyle === preset.id} onClick={() => update("budget", normalizeBudget({ ...draft.budget, ...preset.budget }))}><strong>{preset.label}</strong><small>{preset.description}</small></button>)}</div>
            <p className="budget-hint">All providers receive the selected workflow, including smaller models. Editing limits below keeps your work style. Your requested scope always takes priority.</p>
            <SettingRow title="Enforce custom token & tool limits" description="Off by default. Turn this on only when you want Dots to stop at the caps below."><Toggle label="Enforce custom token & tool limits" checked={!!draft.budget.enforceLimits} onChange={value => update("budget", { ...draft.budget, enforceLimits: value })} /></SettingRow>
            <div className="profile-form-grid token-fields">{([
              ['maxContextTokens', 'Context per request', 1024, 128000],
              ['maxOutputTokens', 'Output per response', 128, 32000],
              ['maxTokens', 'Total tokens per task', 1024, 2000000],
            ] as const).map(([key, label, min, max]) => <Field key={key} label={label}><input type="number" disabled={!draft.budget.enforceLimits} min={min} max={max} value={draft.budget[key]} onChange={event => update("budget", { ...draft.budget, [key]: Number(event.target.value) })} /></Field>)}</div>
            <p className="budget-hint">Automatic mode compacts older activity, expands context when needed, and uses the provider’s response length. Work style guides effort without cutting off tools. Custom caps apply when enabled; Codex manages its own context and output. The time limit, cancellation, permissions, and provider limits still apply.</p>
            <div className="profile-form-grid">
              <Field label="Maximum duration (minutes)">
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={draft.budget.maxMinutes}
                  onChange={(event) =>
                    update("budget", {
                      ...draft.budget,
                      maxMinutes: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field
                label="Maximum tool steps"
                hint="Applies to compatible API providers."
              >
                <input
                  type="number"
                  min={1}
                  max={500}
                  disabled={!draft.budget.enforceLimits}
                  value={draft.budget.maxSteps}
                  onChange={(event) =>
                    update("budget", {
                      ...draft.budget,
                      maxSteps: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
          </PanelSection>
          <PanelSection title="Manage your dot" className="profile-danger">
            <SettingRow
              title="Start a fresh session"
              description="Reset provider context for future tasks. Saved activity, memory, and files remain available."
            >
              <button
                className="btn-secondary"
                onClick={reset}
                disabled={resetting}
              >
                <RotateCcw size={13} /> Reset session
              </button>
            </SettingRow>
            <SettingRow
              title="Delete this dot"
              description="Remove this dot, its activity, memory, and schedules."
            >
              <button
                className="btn-danger"
                onClick={() => setDeleteOpen(!deleteOpen)}
              >
                <Trash2 size={13} /> Delete
              </button>
            </SettingRow>
            {deleteOpen && (
              <div className="profile-delete-confirm">
                <p>
                  This permanently removes {activeDot?.name} and its saved data.
                  Type the dot’s name to confirm.
                </p>
                <Field label="Dot name">
                  <input
                    value={deleteName}
                    onChange={(event) => setDeleteName(event.target.value)}
                    placeholder={activeDot?.name}
                  />
                </Field>
                <label
                  className="profile-check-label"
                  style={{ marginTop: 14 }}
                >
                  <input
                    type="checkbox"
                    checked={deleteWorkspace}
                    onChange={(event) =>
                      setDeleteWorkspace(event.target.checked)
                    }
                  />{" "}
                  Also delete the workspace folder and its files
                </label>
                <div className="profile-actions">
                  <button
                    className="btn-ghost"
                    onClick={() => setDeleteOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-danger"
                    disabled={deleting || deleteName !== activeDot?.name}
                    onClick={remove}
                  >
                    {deleting ? "Deleting…" : "Permanently delete dot"}
                  </button>
                </div>
              </div>
            )}
          </PanelSection>
        </>
      )}
    </div>
  );
}
