import { useState } from "react";
import {
  KeyRound,
  SlidersHorizontal,
  Cpu,
  Plus,
  Trash2,
  RefreshCw,
  Folder,
  Sun,
  Moon,
  Monitor,
  Power,
  ArrowUpRight,
  Pencil,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  AppSettings,
  ProviderProfile,
  ProviderProfileInput,
} from "@shared/types";
import {
  ModalShell,
  Field,
  PanelSection,
  SettingRow,
  Toggle,
  errorMessage,
} from "./PanelPrimitives";

export function SettingsModal() {
  const { showSettingsModal } = useApp();
  return showSettingsModal ? <SettingsContent /> : null;
}

function SettingsContent() {
  const {
    setShowSettingsModal,
    settings,
    auth,
    loginProgress,
    providers,
    showToast,
    refreshBootstrap,
    refreshProviders,
  } = useApp();
  const [tab, setTab] = useState<"account" | "providers" | "desktop">(
    "account",
  );
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState("");
  const [path, setPath] = useState(settings?.codexPathOverride || "");
  const [concurrency, setConcurrency] = useState(
    String(settings?.maxConcurrentRuns || 3),
  );
  const [providerEditor, setProviderEditor] =
    useState<ProviderProfileInput | null>(null);
  const [providerTest, setProviderTest] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [deleteProvider, setDeleteProvider] = useState<string | null>(null);
  const perform = async (
    action: string,
    work: () => Promise<unknown>,
    success?: string,
  ) => {
    try {
      setBusy(action);
      await work();
      if (success) showToast(success, "success");
    } catch (error) {
      showToast(
        errorMessage(error, "This setting could not be updated."),
        "error",
      );
    } finally {
      setBusy("");
    }
  };
  const general = (patch: Partial<AppSettings>) =>
    perform("general", async () => {
      await window.dots.api.updateSettings(patch);
      await refreshBootstrap();
    });
  const startLogin = (method: "browser" | "device") =>
    perform("login", () => window.dots.api.startCodexLogin(method));
  const keyLogin = () =>
    perform(
      "login",
      async () => {
        await window.dots.api.loginCodexWithApiKey(key.trim());
        setKey("");
        await refreshBootstrap();
      },
      "Account connected.",
    );
  const signOut = () => {
    if (confirm("Sign out of the Codex account used by Dots?"))
      void perform(
        "logout",
        async () => {
          await window.dots.api.logoutCodex();
          await refreshBootstrap();
        },
        "Signed out.",
      );
  };
  const pickWorkspace = () =>
    perform("folder", async () => {
      const selected = await window.dots.api.pickFolder(
        settings?.defaultWorkspaceRoot,
      );
      if (selected) {
        await window.dots.api.updateSettings({
          defaultWorkspaceRoot: selected,
        });
        await refreshBootstrap();
      }
    });
  const editProvider = (profile: ProviderProfile) =>
    setProviderEditor({
      id: profile.id,
      label: profile.label,
      baseUrl: profile.baseUrl,
      defaultModel: profile.defaultModel,
      apiKey: "",
    });
  const saveProvider = () => {
    if (!providerEditor) return;
    void perform(
      "provider",
      async () => {
        await window.dots.api.saveProviderProfile({
          ...providerEditor,
          label: providerEditor.label.trim(),
          baseUrl: providerEditor.baseUrl.trim(),
          defaultModel: providerEditor.defaultModel.trim(),
          apiKey: providerEditor.apiKey?.trim() || undefined,
        });
        setProviderEditor(null);
        await refreshBootstrap();
        await refreshProviders();
      },
      "Provider profile saved.",
    );
  };
  const testProvider = (id: string) =>
    perform(`test:${id}`, async () => {
      const result = await window.dots.api.testProvider(id);
      setProviderTest((previous) => ({ ...previous, [id]: result }));
      showToast(result.message, result.ok ? "success" : "error");
    });
  const removeProvider = (id: string) =>
    perform(
      `delete:${id}`,
      async () => {
        await window.dots.api.deleteProviderProfile(id);
        setDeleteProvider(null);
        if (providerEditor?.id === id) setProviderEditor(null);
        await refreshBootstrap();
        await refreshProviders();
      },
      "Provider removed.",
    );
  const connected = auth?.installed && auth.loggedIn;
  const loginActive = !!loginProgress?.active;
  const close = () => {
    if (!busy) setShowSettingsModal(false);
  };
  return (
    <ModalShell
      title="Settings"
      subtitle="Your accounts, your computer, and the way Dots works for you."
      onClose={close}
      width={740}
      className="settings-shell"
      footer={
        <button className="btn-primary" onClick={close} disabled={!!busy}>
          Done
        </button>
      }
    >
      <nav className="profile-tabs" aria-label="App settings sections">
        {(
          [
            { id: "account", label: "Account", icon: KeyRound },
            { id: "providers", label: "Model providers", icon: Cpu },
            { id: "desktop", label: "Desktop", icon: SlidersHorizontal },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            className={tab === id ? "is-active" : ""}
            aria-current={tab === id ? "page" : undefined}
            key={id}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>
      {tab === "account" && (
        <>
          <PanelSection
            title="Your Codex account"
            description="Dots uses the Codex CLI installed on this computer and its authenticated session."
          >
            <div className="profile-provider-status">
              <div>
                <strong>
                  <span
                    className={`profile-status-dot ${connected ? "is-connected" : ""}`}
                  />
                  {connected
                    ? auth.mode === "chatgpt"
                      ? `ChatGPT${auth.plan ? ` · ${auth.plan}` : ""}`
                      : "Authenticated Codex account"
                    : auth?.installed
                      ? "Ready to connect"
                      : "Codex CLI not found"}
                </strong>
                <p>
                  {connected
                    ? auth.email || "Using your authenticated local session"
                    : auth?.installed
                      ? "Sign in to give your dots an intelligence provider."
                      : "Install Codex or specify its executable path below."}
                  {auth?.codexVersion ? ` · ${auth.codexVersion}` : ""}
                </p>
              </div>
              <button
                className="btn-ghost profile-icon-button"
                aria-label="Refresh account status"
                disabled={!!busy}
                onClick={() => perform("refresh", refreshBootstrap)}
              >
                <RefreshCw
                  size={14}
                  className={busy === "refresh" ? "spin" : ""}
                />
              </button>
            </div>
            {auth?.error && <p className="settings-error">{auth.error}</p>}
            {connected ? (
              <div
                className="profile-actions"
                style={{ marginTop: 17, justifyContent: "flex-end" }}
              >
                <button
                  className="btn-secondary"
                  onClick={signOut}
                  disabled={!!busy}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="profile-stack" style={{ marginTop: 20 }}>
                <div className="profile-actions">
                  <button
                    className="btn-primary"
                    onClick={() => startLogin("browser")}
                    disabled={!!busy || loginActive || !auth?.installed}
                  >
                    {busy === "login" ? (
                      <Loader2 size={13} className="spin" />
                    ) : (
                      <KeyRound size={13} />
                    )}{" "}
                    Sign in with ChatGPT
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => startLogin("device")}
                    disabled={!!busy || loginActive || !auth?.installed}
                  >
                    Use a device code
                  </button>
                </div>
                {!auth?.installed && (
                  <button
                    className="profile-text-button"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() =>
                      window.dots.api.openExternal(
                        "https://developers.openai.com/codex/cli",
                      )
                    }
                  >
                    Codex installation guide{" "}
                    <ArrowUpRight
                      size={12}
                      style={{ verticalAlign: "middle" }}
                    />
                  </button>
                )}
                <Field label="Or connect with an API key">
                  <div className="profile-inline">
                    <input
                      type="password"
                      autoComplete="off"
                      aria-label="Codex API key"
                      value={key}
                      onChange={(event) => setKey(event.target.value)}
                      placeholder="OpenAI API key"
                    />
                    <button
                      className="btn-secondary"
                      onClick={keyLogin}
                      disabled={
                        !!busy || loginActive || !key.trim() || !auth?.installed
                      }
                    >
                      Connect
                    </button>
                  </div>
                </Field>
              </div>
            )}
            {(loginActive || loginProgress?.error) && (
              <div className="profile-note settings-login-progress">
                <Info size={15} />
                <div>
                  {loginProgress?.error ||
                    loginProgress?.message ||
                    "Complete the sign-in flow to connect your account."}
                  {loginProgress?.code && (
                    <span className="settings-login-code">
                      {loginProgress.code}
                    </span>
                  )}
                  <div className="profile-actions" style={{ marginTop: 9 }}>
                    {loginProgress?.url && (
                      <button
                        className="profile-text-button"
                        onClick={() =>
                          window.dots.api.openExternal(loginProgress.url!)
                        }
                      >
                        Open sign-in page{" "}
                        <ArrowUpRight
                          size={11}
                          style={{ verticalAlign: "middle" }}
                        />
                      </button>
                    )}
                    {loginActive && (
                      <button
                        className="btn-ghost"
                        disabled={!!busy}
                        onClick={() =>
                          perform("cancel-login", () =>
                            window.dots.api.cancelCodexLogin(),
                          )
                        }
                      >
                        Cancel sign-in
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </PanelSection>
          <PanelSection title="Codex configuration">
            <div className="profile-stack">
              <Field
                label="Executable path"
                hint="Leave this empty to detect Codex automatically."
              >
                <div className="profile-inline">
                  <input
                    value={path}
                    onChange={(event) => setPath(event.target.value)}
                    placeholder={auth?.codexPath || "Detect automatically"}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                  <button
                    className="btn-secondary"
                    disabled={
                      !!busy || path.trim() === settings?.codexPathOverride
                    }
                    onClick={() => general({ codexPathOverride: path.trim() })}
                  >
                    Apply
                  </button>
                </div>
              </Field>
              <SettingRow
                title="Use my Codex configuration"
                description="Load your existing Codex configuration, including enabled MCP servers, plugins, and hooks. Otherwise tasks use an isolated configuration."
              >
                <Toggle
                  label="Use personal Codex configuration"
                  checked={settings?.useCodexUserConfig ?? false}
                  disabled={!!busy}
                  onChange={(value) => general({ useCodexUserConfig: value })}
                />
              </SettingRow>
            </div>
          </PanelSection>
        </>
      )}
      {tab === "providers" && (
        <>
          <PanelSection
            title="Compatible API providers"
            description="Connect an endpoint that implements the OpenAI chat API. Saved keys use your operating system’s encrypted storage."
          >
            {providers.length ? (
              providers.map((profile) => (
                <div className="settings-provider-row" key={profile.id}>
                  <div>
                    <strong>{profile.label}</strong>
                    <p>
                      {profile.baseUrl}
                      <br />
                      {profile.defaultModel}
                    </p>
                    <span className="settings-provider-key">
                      {profile.hasKey ? "API key saved" : "No API key saved"}
                      {providerTest[profile.id]
                        ? ` · ${providerTest[profile.id].ok ? "Last test passed" : "Last test failed"}`
                        : ""}
                    </span>
                  </div>
                  <div className="profile-actions">
                    {deleteProvider === profile.id ? (
                      <>
                        <button
                          className="btn-ghost"
                          onClick={() => setDeleteProvider(null)}
                          disabled={!!busy}
                        >
                          Keep
                        </button>
                        <button
                          className="btn-danger"
                          onClick={() => removeProvider(profile.id)}
                          disabled={!!busy}
                        >
                          Remove
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-ghost"
                          onClick={() => testProvider(profile.id)}
                          disabled={!!busy}
                          title="Test connection"
                        >
                          <RefreshCw
                            size={13}
                            className={
                              busy === `test:${profile.id}` ? "spin" : ""
                            }
                          />{" "}
                          Test
                        </button>
                        <button
                          className="btn-ghost profile-icon-button"
                          onClick={() => editProvider(profile)}
                          disabled={!!busy}
                          aria-label={`Edit ${profile.label}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="btn-ghost profile-icon-button"
                          onClick={() => setDeleteProvider(profile.id)}
                          disabled={!!busy}
                          aria-label={`Remove ${profile.label}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div
                className="profile-empty"
                style={{ padding: "15px 15px 25px" }}
              >
                <div className="profile-empty-icon">
                  <Cpu size={22} />
                </div>
                <h3>Choose the intelligence behind your dots</h3>
                <p>
                  Add an API provider to use your preferred hosted or local
                  model.
                </p>
              </div>
            )}
            <button
              className="btn-secondary"
              style={{ marginTop: 17 }}
              disabled={!!busy}
              onClick={() =>
                setProviderEditor({
                  label: "",
                  baseUrl: "https://api.openai.com/v1",
                  defaultModel: "",
                  apiKey: "",
                })
              }
            >
              <Plus size={13} /> Add provider
            </button>
          </PanelSection>
          {providerEditor && (
            <PanelSection
              title={providerEditor.id ? "Edit provider" : "Connect a provider"}
            >
              <div className="profile-stack">
                <div className="profile-form-grid">
                  <Field label="Provider name">
                    <input
                      value={providerEditor.label}
                      onChange={(event) =>
                        setProviderEditor({
                          ...providerEditor,
                          label: event.target.value,
                        })
                      }
                      placeholder="OpenAI, Ollama, or your provider"
                    />
                  </Field>
                  <Field label="Default model">
                    <input
                      value={providerEditor.defaultModel}
                      onChange={(event) =>
                        setProviderEditor({
                          ...providerEditor,
                          defaultModel: event.target.value,
                        })
                      }
                      placeholder="Model ID from your provider"
                    />
                  </Field>
                </div>
                <Field label="API base URL">
                  <input
                    value={providerEditor.baseUrl}
                    onChange={(event) =>
                      setProviderEditor({
                        ...providerEditor,
                        baseUrl: event.target.value,
                      })
                    }
                    placeholder="https://api.openai.com/v1"
                  />
                </Field>
                <Field
                  label={
                    providerEditor.id ? "Replace API key (optional)" : "API key"
                  }
                  hint={
                    providerEditor.id
                      ? "Leave empty to keep the saved key."
                      : "Enter the credential accepted by your endpoint."
                  }
                >
                  <input
                    type="password"
                    autoComplete="off"
                    value={providerEditor.apiKey || ""}
                    onChange={(event) =>
                      setProviderEditor({
                        ...providerEditor,
                        apiKey: event.target.value,
                      })
                    }
                    placeholder={
                      providerEditor.id ? "Keep existing key" : "API key"
                    }
                  />
                </Field>
                <div
                  className="profile-actions"
                  style={{ justifyContent: "flex-end" }}
                >
                  <button
                    className="btn-ghost"
                    disabled={!!busy}
                    onClick={() => setProviderEditor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-primary"
                    onClick={saveProvider}
                    disabled={
                      !!busy ||
                      !providerEditor.label.trim() ||
                      !providerEditor.baseUrl.trim() ||
                      !providerEditor.defaultModel.trim() ||
                      (!providerEditor.id && !providerEditor.apiKey?.trim())
                    }
                  >
                    {busy === "provider" ? (
                      <Loader2 size={13} className="spin" />
                    ) : (
                      <CheckCircle2 size={13} />
                    )}{" "}
                    Save provider
                  </button>
                </div>
              </div>
            </PanelSection>
          )}
          <div className="profile-note">
            <Info size={15} />
            <div>
              Choose a provider separately in each dot’s profile. Adding a model
              provider does not connect Slack, Teams, or other external
              accounts.
            </div>
          </div>
        </>
      )}
      {tab === "desktop" && (
        <>
          <PanelSection title="At home on your desktop">
            <Field label="Appearance">
              <div
                className="profile-choice-group"
                role="group"
                aria-label="App appearance"
              >
                {(
                  [
                    { id: "system", label: "System", icon: Monitor },
                    { id: "light", label: "Light", icon: Sun },
                    { id: "dark", label: "Dark", icon: Moon },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    className={settings?.theme === id ? "is-selected" : ""}
                    aria-pressed={settings?.theme === id}
                    key={id}
                    disabled={!!busy}
                    onClick={() => general({ theme: id })}
                  >
                    <Icon size={13} />
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <div style={{ marginTop: 23 }}>
              <SettingRow
                title="Keep Dots in the background"
                description="Closing the window keeps tasks and schedules running in the system tray."
              >
                <Toggle
                  label="Run in background"
                  checked={settings?.runInBackground ?? true}
                  disabled={!!busy}
                  onChange={(value) => general({ runInBackground: value })}
                />
              </SettingRow>
              <SettingRow
                title="Launch when I sign in"
                description="Start Dots automatically when you log in to this computer."
              >
                <Toggle
                  label="Launch at system login"
                  checked={settings?.launchAtLogin ?? false}
                  disabled={!!busy}
                  onChange={(value) => general({ launchAtLogin: value })}
                />
              </SettingRow>
              <SettingRow
                title="Start in the system tray"
                description="Keep the window tucked away when Dots starts."
              >
                <Toggle
                  label="Start minimized"
                  checked={settings?.startMinimized ?? false}
                  disabled={!!busy}
                  onChange={(value) => general({ startMinimized: value })}
                />
              </SettingRow>
              <SettingRow
                title="Desktop notifications"
                description="Hear when work is complete or a task needs your input."
              >
                <Toggle
                  label="Desktop notifications"
                  checked={settings?.desktopNotifications ?? true}
                  disabled={!!busy}
                  onChange={(value) => general({ desktopNotifications: value })}
                />
              </SettingRow>
            </div>
          </PanelSection>
          <PanelSection title="Your on-screen dot" description="A small, draggable teammate shares live activity while Dots runs in the background.">
            <SettingRow title="Show a desktop dot" description="Appears when the main window is minimized or closed to the tray.">
              <Toggle label="Show desktop dot" checked={settings?.desktopDotEnabled ?? true} disabled={!!busy} onChange={value=>general({desktopDotEnabled:value,...(value?{runInBackground:true}:{})})}/>
            </SettingRow>
            <Field label="When to show it"><select aria-label="Desktop dot visibility" value={settings?.desktopDotMode ?? 'background'} disabled={!!busy} onChange={event=>general({desktopDotMode:event.target.value as 'background'|'always'})}><option value="background">When Dots is in the background</option><option value="always">Always on screen</option></select></Field>
            <SettingRow title="Read activity updates aloud" description="Use your computer's voice to speak the dot's short updates. Off by default."><Toggle label="Spoken desktop dot updates" checked={settings?.desktopDotVoice ?? false} disabled={!!busy} onChange={value=>general({desktopDotVoice:value})}/></SettingRow>
          </PanelSection>
          <PanelSection title="Workspaces and capacity">
            <div className="profile-stack">
              <Field
                label="Default workspace folder"
                hint="New dots get their own folder within this location."
              >
                <div className="profile-inline">
                  <input
                    value={settings?.defaultWorkspaceRoot || ""}
                    readOnly
                    style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                  <button
                    className="btn-secondary"
                    disabled={!!busy}
                    onClick={pickWorkspace}
                  >
                    <Folder size={13} /> Browse
                  </button>
                </div>
              </Field>
              <Field
                label="Concurrent tasks"
                hint="Allow between 1 and 10 tasks to run at the same time."
              >
                <div className="profile-inline">
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={concurrency}
                    onChange={(event) => setConcurrency(event.target.value)}
                  />
                  <button
                    className="btn-secondary"
                    disabled={
                      !!busy ||
                      !Number(concurrency) ||
                      Number(concurrency) === settings?.maxConcurrentRuns
                    }
                    onClick={() => {
                      const count = Math.min(
                        10,
                        Math.max(1, Math.round(Number(concurrency) || 3)),
                      );
                      setConcurrency(String(count));
                      void general({ maxConcurrentRuns: count });
                    }}
                  >
                    Apply
                  </button>
                </div>
              </Field>
            </div>
          </PanelSection>
          <PanelSection
            title="End this session"
            description="Quitting stops background scheduling until you open Dots again."
          >
            <button
              className="btn-secondary"
              onClick={() => {
                if (
                  confirm(
                    "Quit Dots? Background work and schedules will stop until you reopen the app.",
                  )
                )
                  void window.dots.api.quitApp();
              }}
            >
              <Power size={13} /> Quit Dots
            </button>
          </PanelSection>
        </>
      )}
    </ModalShell>
  );
}
