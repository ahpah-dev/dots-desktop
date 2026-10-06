import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Folder,
  Heart,
  Code2,
  Search,
  Clock,
  FileText,
  Sparkles,
  Info,
  Loader2,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  DotInput,
  DotAvatarConfig,
  FileAccess,
  ModelInfo,
} from "@shared/types";
import { CODEX_PROVIDER_ID } from "@shared/types";
import { groupModels } from "@shared/models";
import { AvatarEditor, DotAvatar, DEFAULT_AVATAR } from "./DotAvatar";
import {
  Field,
  ModalShell,
  PanelSection,
  SettingRow,
  Toggle,
  errorMessage,
} from "./PanelPrimitives";

const TEMPLATES = [
  {
    id: "partner",
    title: "Everyday partner",
    name: "Milo",
    description: "Keep your priorities, projects, and loose ends moving.",
    emoji: "✦",
    color: "#78b7a0",
    icon: Heart,
    instructions:
      "Be a thoughtful partner for my work. Help clarify priorities, research questions, and create useful deliverables. Remember durable preferences and decisions. Keep updates concise and bring decisions that need my input to my attention.",
    files: "write" as FileAccess,
    shell: true,
    web: true,
    accessory: "sprout" as const,
  },
  {
    id: "developer",
    title: "Build & improve",
    name: "Builder",
    description: "Build features, solve bugs, and care for your code.",
    emoji: "💻",
    color: "#93b5d5",
    icon: Code2,
    instructions:
      "You are a thoughtful software engineer. Inspect existing code before changing it. Build clean, maintainable solutions, verify changes with appropriate checks, and explain the result clearly. Remember project conventions and useful build commands.",
    files: "write" as FileAccess,
    shell: true,
    web: true,
    accessory: "headphones" as const,
  },
  {
    id: "researcher",
    title: "Research & discover",
    name: "Scout",
    description: "Find reliable sources and turn them into useful insight.",
    emoji: "🔍",
    color: "#b7a3d6",
    icon: Search,
    instructions:
      "Research questions carefully using current primary sources. Verify claims, compare useful options, and cite sources. Separate evidence from inference. Remember the themes and sources relevant to my ongoing work.",
    files: "write" as FileAccess,
    shell: false,
    web: true,
    accessory: "none" as const,
  },
  {
    id: "watchdog",
    title: "Watch & follow up",
    name: "Watcher",
    description: "Check project health and flag meaningful changes.",
    emoji: "⏱️",
    color: "#e5c77d",
    icon: Clock,
    instructions:
      "Help me keep track of project health. Inspect the available files, changes, tests, and logs. Summarize meaningful changes and flag issues needing attention. Be quiet about unchanged routine results and remember what we learn.",
    files: "read" as FileAccess,
    shell: true,
    web: true,
    accessory: "cap" as const,
  },
  {
    id: "writer",
    title: "Write & organize",
    name: "Writer",
    description: "Shape ideas, documentation, and clear deliverables.",
    emoji: "✍️",
    color: "#dba9ba",
    icon: FileText,
    instructions:
      "Help me write clear, accurate documents. Read relevant source material, organize the ideas, and prepare polished Markdown drafts. Adapt to my writing preferences and remember decisions about tone and structure.",
    files: "write" as FileAccess,
    shell: false,
    web: false,
    accessory: "none" as const,
  },
  {
    id: "blank",
    title: "Start with an idea",
    name: "My dot",
    description: "Make a dot around the way you like to work.",
    emoji: "✦",
    color: "#dea88d",
    icon: Sparkles,
    instructions:
      "Be a resourceful, careful partner for my work. Ask for missing context when needed, verify your work, and explain results clearly.",
    files: "write" as FileAccess,
    shell: true,
    web: true,
    accessory: "none" as const,
  },
];

export function NewDotModal() {
  const { showNewDotModal } = useApp();
  return showNewDotModal ? <NewDotWizard /> : null;
}

function NewDotWizard() {
  const {
    setShowNewDotModal,
    providerOptions,
    openDot,
    showToast,
    refreshBootstrap,
  } = useApp();
  const [step, setStep] = useState(0);
  const [templateId, setTemplateId] = useState("partner");
  const [name, setName] = useState(TEMPLATES[0].name);
  const [description, setDescription] = useState(TEMPLATES[0].description);
  const [color, setColor] = useState(TEMPLATES[0].color);
  const [avatar, setAvatar] = useState<DotAvatarConfig>({
    ...DEFAULT_AVATAR,
    accessory: "sprout",
  });
  const [instructions, setInstructions] = useState(TEMPLATES[0].instructions);
  const [workspace, setWorkspace] = useState("");
  const [customWorkspace, setCustomWorkspace] = useState(false);
  const [providerId, setProviderId] = useState(
    providerOptions.find((item) => item.available)?.id || CODEX_PROVIDER_ID,
  );
  const [model, setModel] = useState("auto");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [files, setFiles] = useState<FileAccess>("write");
  const [shell, setShell] = useState(true);
  const [web, setWeb] = useState(true);
  const [creating, setCreating] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const provider = providerOptions.find((item) => item.id === providerId);
  useEffect(() => {
    if (customWorkspace || !name.trim()) return;
    let current = true;
    window.dots.api
      .defaultWorkspaceFor(name)
      .then((path) => {
        if (current) setWorkspace(path);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [name, customWorkspace]);
  useEffect(() => {
    let current = true;
    setLoadingModels(true);
    setModels([]);
    window.dots.api
      .listModels(providerId)
      .then((result) => {
        if (current) setModels(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (current) setLoadingModels(false);
      });
    return () => {
      current = false;
    };
  }, [providerId]);
  const selectTemplate = (template: (typeof TEMPLATES)[number]) => {
    setTemplateId(template.id);
    setName(template.name);
    setDescription(template.description);
    setInstructions(template.instructions);
    setColor(template.color);
    setAvatar({
      ...DEFAULT_AVATAR,
      accessory: template.accessory,
      glasses: template.id === "researcher" ? "round" : "none",
    });
    setFiles(template.files);
    setShell(template.shell);
    setWeb(template.web);
  };
  const pickFolder = async () => {
    try {
      const chosen = await window.dots.api.pickFolder(workspace);
      if (chosen) {
        setWorkspace(chosen);
        setCustomWorkspace(true);
      }
    } catch (error) {
      showToast(errorMessage(error, "Could not choose a folder."), "error");
    }
  };
  const close = () => {
    if (!creating) setShowNewDotModal(false);
  };
  const create = async () => {
    if (!name.trim()) return;
    try {
      setCreating(true);
      const input: DotInput = {
        name: name.trim(),
        description: description.trim(),
        color,
        avatar,
        emoji: TEMPLATES.find((item) => item.id === templateId)?.emoji || "✦",
        instructions: instructions.trim(),
        workspacePath: workspace.trim() || undefined,
        providerId,
        model: model.trim() || "auto",
        notify: true,
        permissions: {
          files,
          shell,
          web,
          outsideWorkspace: false,
          approval: "never",
        },
      };
      const dot = await window.dots.api.createDot(input);
      await refreshBootstrap();
      openDot(dot.id);
      setShowNewDotModal(false);
      showToast(`${dot.name} is ready to get to know your work.`, "success");
    } catch (error) {
      showToast(errorMessage(error, "Could not create your dot."), "error");
    } finally {
      setCreating(false);
    }
  };
  return (
    <ModalShell
      title="Meet your new dot"
      subtitle="A dedicated partner that remembers your work and keeps it moving."
      onClose={close}
      width={760}
      footer={
        <>
          <span className="footer-hint">
            {step === 0
              ? "You can change everything later."
              : "Runs locally while Dots is open."}
          </span>
          {step === 1 && (
            <button
              className="btn-ghost"
              onClick={() => setStep(0)}
              disabled={creating}
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button
            className="btn-primary"
            disabled={creating || !name.trim()}
            onClick={step === 0 ? () => setStep(1) : create}
          >
            {creating ? (
              <Loader2 size={14} className="spin" />
            ) : step === 0 ? null : (
              <Plus size={14} />
            )}
            {step === 0 ? (
              <>
                Continue <ArrowRight size={14} />
              </>
            ) : creating ? (
              "Creating your dot…"
            ) : (
              `Create ${name.trim() || "dot"}`
            )}
          </button>
        </>
      }
    >
      <div className="new-dot-steps">
        <div className={`new-dot-step ${step === 0 ? "is-active" : ""}`}>
          <span>1</span> Make it yours
        </div>
        <div className="new-dot-step-line" />
        <div className={`new-dot-step ${step === 1 ? "is-active" : ""}`}>
          <span>2</span> Give it a starting point
        </div>
      </div>
      {step === 0 ? (
        <>
          <div
            className="new-dot-templates"
            role="group"
            aria-label="Dot starting point"
          >
            {TEMPLATES.map((template) => {
              const Icon = template.icon;
              return (
                <button
                  className={`new-dot-template ${templateId === template.id ? "is-selected" : ""}`}
                  key={template.id}
                  aria-pressed={templateId === template.id}
                  onClick={() => selectTemplate(template)}
                >
                  <Icon size={18} />
                  <div>
                    <strong>{template.title}</strong>
                    <p>{template.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="profile-form-grid" style={{ marginBottom: 24 }}>
            <Field label="Name">
              <input
                data-autofocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Give your dot a name"
                maxLength={80}
              />
            </Field>
            <Field label="About your dot">
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What you’ll work on together"
                maxLength={300}
              />
            </Field>
          </div>
          <PanelSection title="A familiar face">
            <AvatarEditor
              value={avatar}
              color={color}
              onChange={setAvatar}
              onColorChange={setColor}
              compact
            />
          </PanelSection>
        </>
      ) : (
        <>
          <div className="new-dot-preview">
            <DotAvatar
              avatar={avatar}
              color={color}
              name={name}
              size={70}
              animated
            />
            <div>
              <strong>{name}</strong>
              <p>{description || "Your new partner for the work ahead."}</p>
            </div>
          </div>
          <div className="profile-stack">
            <Field
              label="How would you like to work together?"
              hint="Tell your dot what matters, how you prefer updates, and where your judgment is needed."
            >
              <textarea
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={5}
              />
            </Field>
            <Field
              label="A workspace on this computer"
              hint="Your dot can read and create work here. A dedicated folder keeps it easy to find."
            >
              <div className="profile-inline">
                <input
                  value={workspace}
                  onChange={(event) => {
                    setWorkspace(event.target.value);
                    setCustomWorkspace(true);
                  }}
                />
                <button className="btn-secondary" onClick={pickFolder}>
                  <Folder size={14} /> Browse
                </button>
              </div>
            </Field>
            <PanelSection title="Connect its intelligence">
              <Field label="Provider">
                <select
                  value={providerId}
                  onChange={(event) => {
                    setProviderId(event.target.value);
                    setModel("auto");
                  }}
                >
                  {providerOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                      {!item.available ? " · Not connected" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              {!provider?.available && (
                <div
                  className="profile-note is-warning"
                  style={{ marginTop: 14 }}
                >
                  <Info size={14} />
                  <div>
                    {provider?.reason || "This provider is not connected."} You
                    can create your dot now and connect an account in app
                    settings before starting work.
                  </div>
                </div>
              )}
              <button
                className="profile-text-button"
                style={{ marginTop: 16 }}
                onClick={() => setAdvanced(!advanced)}
                aria-expanded={advanced}
              >
                {advanced
                  ? "Hide model & tool settings"
                  : "Adjust model & tool settings"}
              </button>
              {advanced && (
                <div className="profile-stack" style={{ marginTop: 19 }}>
                  <div className="profile-form-grid">
                    <Field label={loadingModels ? "Model · Loading…" : "Model"}>
                      <select
                        value={model}
                        onChange={(event) => setModel(event.target.value)}
                      >
                        <option value="auto">
                          Automatic · Provider recommended
                        </option>
                        {groupModels(models).map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.models.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {model !== "auto" &&
                          !models.some((item) => item.id === model) && (
                            <option value={model}>{model} · Custom</option>
                          )}
                      </select>
                    </Field>
                    <Field label="Custom model ID">
                      <input
                        value={model === "auto" ? "" : model}
                        onChange={(event) =>
                          setModel(event.target.value.trim() || "auto")
                        }
                        placeholder="Provider default"
                      />
                    </Field>
                  </div>
                  <div>
                    <SettingRow title="Workspace files">
                      <select
                        aria-label="Workspace file access"
                        value={files}
                        onChange={(event) =>
                          setFiles(event.target.value as FileAccess)
                        }
                      >
                        <option value="write">Read & write</option>
                        <option value="read">Read only</option>
                      </select>
                    </SettingRow>
                    <SettingRow title="Run commands">
                      <Toggle
                        label="Allow shell commands"
                        checked={shell}
                        onChange={setShell}
                      />
                    </SettingRow>
                    <SettingRow title="Search and browse the web">
                      <Toggle
                        label="Allow web access"
                        checked={web}
                        onChange={setWeb}
                      />
                    </SettingRow>
                  </div>
                </div>
              )}
            </PanelSection>
          </div>
        </>
      )}
    </ModalShell>
  );
}
