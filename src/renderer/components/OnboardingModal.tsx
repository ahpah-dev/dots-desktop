import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  Clock,
  Bell,
  CheckCircle2,
  KeyRound,
  Info,
  RefreshCw,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { DotAvatar } from "./DotAvatar";
import {
  ModalShell,
  Field,
  PanelSection,
  errorMessage,
} from "./PanelPrimitives";

export function OnboardingModal() {
  const { showOnboardingModal } = useApp();
  return showOnboardingModal ? <OnboardingContent /> : null;
}

function OnboardingContent() {
  const {
    setShowOnboardingModal,
    setShowNewDotModal,
    setShowSettingsModal,
    auth,
    loginProgress,
    providerOptions,
    bootstrap,
    showToast,
    refreshBootstrap,
  } = useApp();
  const [step, setStep] = useState(0);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const codexConnected = auth?.installed && auth.loggedIn;
  const available = providerOptions.some((provider) => provider.available);
  const finish = async (create: boolean, connectProvider = false) => {
    if (busy) return;
    try {
      setBusy(true);
      await window.dots.api.updateSettings({ onboardingComplete: true });
      await refreshBootstrap();
      setShowOnboardingModal(false);
      if (connectProvider) setShowSettingsModal(true, 'providers');
      if (create && !bootstrap?.dots.length) setShowNewDotModal(true);
    } catch (error) {
      showToast(errorMessage(error, "Could not finish setup."), "error");
    } finally {
      setBusy(false);
    }
  };
  const login = async (method: "browser" | "device") => {
    try {
      setBusy(true);
      await window.dots.api.startCodexLogin(method);
    } catch (error) {
      showToast(errorMessage(error, "Could not start sign-in."), "error");
    } finally {
      setBusy(false);
    }
  };
  const saveKey = async () => {
    try {
      setBusy(true);
      await window.dots.api.loginCodexWithApiKey(key.trim());
      setKey("");
      await refreshBootstrap();
      showToast("Account connected.", "success");
    } catch (error) {
      showToast(errorMessage(error, "Could not connect this key."), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ModalShell
      title="Welcome to Dots"
      onClose={() => {
        if (!busy) void finish(false);
      }}
      width={650}
      className="onboarding-shell"
      footer={
        <>
          <span className="footer-hint">
            {step === 0
              ? "A little setup. A lot of possibility."
              : "Your settings can be changed anytime."}
          </span>
          {step === 1 && (
            <button
              className="btn-ghost"
              onClick={() => setStep(0)}
              disabled={busy}
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button
            className="btn-primary"
            disabled={busy}
            onClick={step === 0 ? () => setStep(1) : () => finish(true)}
          >
            {busy ? <Loader2 size={13} className="spin" /> : null}
            {step === 0
              ? "Get started"
              : bootstrap?.dots.length
                ? "Open my workspace"
                : "Create my first dot"}{" "}
            <ArrowRight size={14} />
          </button>
        </>
      }
    >
      {step === 0 ? (
        <>
          <div className="onboarding-hero">
            <DotAvatar
              name="Your dot"
              color="#78b7a0"
              avatar={{
                shape: "circle",
                eyes: "dot",
                glasses: "none",
                accessory: "sprout",
              }}
              size={139}
              animated
            />
            <h3>
              Good work deserves
              <br />a little company.
            </h3>
            <p>
              Meet a dedicated partner for your projects. Give it a name, share
              what matters, and let it help with the next step.
            </p>
          </div>
          <div className="onboarding-benefits">
            {[
              {
                icon: Brain,
                title: "It remembers",
                description:
                  "Your preferences, decisions, and project context.",
              },
              {
                icon: Clock,
                title: "It follows through",
                description:
                  "Ongoing responsibilities and scheduled check-ins.",
              },
              {
                icon: Bell,
                title: "It brings you in",
                description: "Results and decisions that need your attention.",
              },
            ].map(({ icon: Icon, title, description }) => (
              <div className="onboarding-benefit" key={title}>
                <Icon size={21} />
                <strong>{title}</strong>
                <p>{description}</p>
              </div>
            ))}
          </div>
          <div className="profile-note">
            <Info size={15} />
            <div>
              Your dots work on this computer. Keep Dots running, including in
              the system tray, for background tasks and schedules.
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="onboarding-hero" style={{ paddingBottom: 23 }}>
            <DotAvatar
              name="Your dot"
              color="#93b5d5"
              avatar={{ glasses: "round" }}
              size={92}
            />
            <h3 style={{ fontSize: 25 }}>Connect its intelligence.</h3>
            <p>
              Use your authenticated Codex account, or add a compatible API
              provider in settings. You can also explore first and connect
              later.
            </p>
          </div>
          <PanelSection title="Use a router or local model" description="Guided setup for NVIDIA NIM, OpenRouter free models, Groq, Cerebras, Ollama, LM Studio, and custom endpoints.">
            <button className="btn-secondary" disabled={busy} onClick={() => void finish(false, true)}>Connect an API provider <ArrowUpRight size={14} /></button>
          </PanelSection>
          <PanelSection
            title={
              codexConnected
                ? "Your account is ready"
                : available
                  ? "A provider is already available"
                  : "Connect an account"
            }
          >
            {codexConnected ? (
              <div className="profile-provider-status">
                <div>
                  <strong>
                    <CheckCircle2
                      size={15}
                      style={{
                        color: "var(--accent-primary)",
                        verticalAlign: "middle",
                        marginRight: 8,
                      }}
                    />
                    {auth.mode === "chatgpt"
                      ? `ChatGPT${auth.plan ? ` · ${auth.plan}` : ""}`
                      : "Codex API account"}
                  </strong>
                  <p>
                    {auth.email || "Authenticated local Codex session"}
                    {auth.codexVersion ? ` · ${auth.codexVersion}` : ""}
                  </p>
                </div>
              </div>
            ) : available ? (
              <div className="profile-note">
                <CheckCircle2 size={17} />
                <div>
                  {providerOptions
                    .filter((provider) => provider.available)
                    .map((provider) => provider.label)
                    .join(", ")}{" "}
                  is available. Choose it when you create your dot.
                </div>
              </div>
            ) : (
              <div className="profile-stack">
                <div className="profile-actions">
                  <button
                    className="btn-primary"
                    disabled={
                      busy || !!loginProgress?.active || !auth?.installed
                    }
                    onClick={() => login("browser")}
                  >
                    <KeyRound size={14} /> Sign in with ChatGPT
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={
                      busy || !!loginProgress?.active || !auth?.installed
                    }
                    onClick={() => login("device")}
                  >
                    Device code
                  </button>
                </div>
                {!auth?.installed && (
                  <div className="profile-note">
                    <Info size={15} />
                    <div>
                      The Codex CLI wasn’t found on this computer.{" "}
                      <button
                        className="profile-text-button"
                        onClick={() =>
                          window.dots.api.openExternal(
                            "https://developers.openai.com/codex/cli",
                          )
                        }
                      >
                        Open the installation guide{" "}
                        <ArrowUpRight
                          size={11}
                          style={{ verticalAlign: "middle" }}
                        />
                      </button>
                      , or connect an API endpoint later in settings.
                    </div>
                  </div>
                )}
                {loginProgress?.active && (
                  <div className="profile-note">
                    <Info size={15} />
                    <div>
                      {loginProgress.message ||
                        "Complete the sign-in flow in your browser."}
                      {loginProgress.code && (
                        <span className="settings-login-code">
                          {loginProgress.code}
                        </span>
                      )}
                      {loginProgress.url && (
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
                    </div>
                  </div>
                )}
                {loginProgress?.error && (
                  <p className="settings-error">{loginProgress.error}</p>
                )}
                <Field label="Or use an OpenAI API key">
                  <div className="profile-inline">
                    <input
                      type="password"
                      value={key}
                      onChange={(event) => setKey(event.target.value)}
                      autoComplete="off"
                      placeholder="API key"
                    />
                    <button
                      className="btn-secondary"
                      disabled={
                        busy ||
                        !key.trim() ||
                        !auth?.installed ||
                        !!loginProgress?.active
                      }
                      onClick={saveKey}
                    >
                      Connect
                    </button>
                  </div>
                </Field>
                <button
                  className="btn-ghost"
                  style={{ alignSelf: "flex-start" }}
                  disabled={busy}
                  onClick={async () => {
                    try {
                      setBusy(true);
                      await refreshBootstrap();
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <RefreshCw size={12} /> Check connection
                </button>
              </div>
            )}
          </PanelSection>
          <p
            className="profile-count"
            style={{ textAlign: "center", lineHeight: 1.7 }}
          >
            Your dot’s files, conversations, and memory stay in this desktop
            workspace.
            <br />
            Model providers receive the context needed to carry out your tasks.
          </p>
        </>
      )}
    </ModalShell>
  );
}
