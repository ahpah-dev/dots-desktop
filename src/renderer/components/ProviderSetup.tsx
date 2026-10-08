import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CheckCircle2, Loader2, Search } from "lucide-react";
import type { ModelInfo, ProviderProfileInput } from "@shared/types";
import { inferPreset, PROVIDER_PRESETS } from "@shared/providerPresets";
import { Field, SettingRow, Toggle } from "./PanelPrimitives";
import "../teamwork.css";

export function ProviderSetup({
  value,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  value: ProviderProfileInput;
  onChange: (value: ProviderProfileInput) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [result, setResult] = useState<{ ok: boolean; message: string }>();
  const [testing, setTesting] = useState(false);
  const [search, setSearch] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const [toolsOnly, setToolsOnly] = useState(false);
  const request = useRef(0);
  const preset =
    PROVIDER_PRESETS.find((item) => item.id === value.presetId) ||
    inferPreset(value.baseUrl);
  useEffect(() => {
    request.current++;
    setModels([]);
    setResult(undefined);
    setTesting(false);
    return () => {
      request.current++;
    };
  }, [value.baseUrl, value.apiKey, value.requiresKey]);
  const update = (patch: Partial<ProviderProfileInput>) =>
    onChange({ ...value, ...patch });
  const discover = async () => {
    const id = ++request.current;
    setTesting(true);
    setResult(undefined);
    try {
      const response = await window.dots.api.inspectProviderProfile(value);
      if (id !== request.current) return;
      setModels(response.models);
      setResult(response);
      if (!value.defaultModel && response.models.length === 1)
        update({ defaultModel: response.models[0].id });
    } catch (error) {
      if (id === request.current)
        setResult({
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Could not reach this provider.",
        });
    } finally {
      if (id === request.current) setTesting(false);
    }
  };
  const visible = models.filter(
    (model) =>
      `${model.id} ${model.label}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!freeOnly || model.free) &&
      (!toolsOnly || model.supportsTools === true),
  );
  return (
    <div className="profile-stack provider-setup">
      {!value.id && (
        <div className="provider-presets" aria-label="Provider presets">
          {PROVIDER_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={preset?.id === item.id}
              className={`provider-preset ${preset?.id === item.id ? "selected" : ""}`}
              disabled={busy}
              onClick={() => {
                setSearch("");
                setFreeOnly(false);
                onChange({
                  label: item.name,
                  baseUrl: item.baseUrl,
                  defaultModel: item.defaultModel,
                  requiresKey: item.requiresKey,
                  presetId: item.id,
                  apiKey: "",
                  fallbackModels: [],
                });
              }}
            >
              <span>
                <strong>{item.name}</strong>
                <small>{item.badge}</small>
              </span>
              <p>{item.description}</p>
            </button>
          ))}
        </div>
      )}
      {preset && (
        <div className="provider-guide">
          <p>{preset.note}</p>
          <div className="profile-actions">
            {preset.keyUrl && (
              <button
                className="btn-secondary"
                onClick={() =>
                  void window.dots.api.openExternal(preset.keyUrl!)
                }
              >
                Get API key <ArrowUpRight size={13} />
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => void window.dots.api.openExternal(preset.docsUrl)}
            >
              Setup guide <ArrowUpRight size={13} />
            </button>
          </div>
        </div>
      )}
      <div className="profile-form-grid">
        <Field label="Provider name">
          <input
            value={value.label}
            onChange={(event) => update({ label: event.target.value })}
            placeholder="My model provider"
          />
        </Field>
        <Field label="Default model">
          <input
            value={value.defaultModel}
            onChange={(event) => update({ defaultModel: event.target.value })}
            placeholder="Discover or enter a model ID"
          />
        </Field>
      </div>
      <Field
        label="API base URL"
        hint="Paste the base URL or a chat completions URL; Dots will normalize it."
      >
        <input
          value={value.baseUrl}
          onChange={(event) => update({ baseUrl: event.target.value })}
          placeholder="https://your-router.example/v1"
          spellCheck={false}
        />
      </Field>
      <SettingRow
        title="API key required"
        description="Turn this off for a local server without authentication."
      >
        <Toggle
          label="API key required"
          checked={value.requiresKey !== false}
          onChange={(requiresKey) => update({ requiresKey })}
        />
      </SettingRow>
      <Field
        label={value.id ? "Replace API key (optional)" : "API key"}
        hint={
          value.id
            ? "Leave empty to keep the encrypted key at its original endpoint."
            : "Keys are encrypted by Windows and never stored in provider metadata."
        }
      >
        <input
          type="password"
          autoComplete="off"
          value={value.apiKey || ""}
          onChange={(event) => update({ apiKey: event.target.value })}
          placeholder={
            value.requiresKey === false
              ? "Optional for local servers"
              : value.id
                ? "Keep saved key"
                : "Paste your key"
          }
        />
      </Field>
      <button
        className="btn-secondary"
        onClick={() => void discover()}
        disabled={
          testing ||
          busy ||
          !value.baseUrl.trim() ||
          (value.requiresKey !== false && !value.id && !value.apiKey?.trim())
        }
      >
        {testing ? (
          <Loader2 size={14} className="spin" />
        ) : (
          <Search size={14} />
        )}{" "}
        {testing ? "Connecting…" : "Test connection & discover models"}
      </button>
      {result && (
        <p
          className={`provider-result ${result.ok ? "success" : "error"}`}
          role="status"
        >
          {result.message}
        </p>
      )}
      {!!models.length && (
        <div className="model-discovery">
          <Field label="Search available models">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or model ID"
            />
          </Field>
          <div className="model-filters">
            <label>
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(event) => setFreeOnly(event.target.checked)}
              />{" "}
              Free only
            </label>
            <label>
              <input
                type="checkbox"
                checked={toolsOnly}
                onChange={(event) => setToolsOnly(event.target.checked)}
              />{" "}
              Confirmed tool support
            </label>
            <small>{visible.length} models</small>
          </div>
          <div className="discovered-models">
            {visible.slice(0, 60).map((model) => (
              <button
                key={model.id}
                aria-pressed={value.defaultModel === model.id}
                className={value.defaultModel === model.id ? "selected" : ""}
                onClick={() => update({ defaultModel: model.id })}
              >
                <span>
                  <strong>{model.label}</strong>
                  <small>{model.id}</small>
                </span>
                <span>
                  {model.free ? "Free · " : ""}
                  {model.contextWindow
                    ? `${Math.round(model.contextWindow / 1000)}k context`
                    : model.supportsTools
                      ? "Tools"
                      : ""}
                </span>
              </button>
            ))}
            {!visible.length && (
              <p>No matching models. Try changing the filters.</p>
            )}
          </div>
          {visible.length > 60 && (
            <small>Showing the first 60. Search to narrow the list.</small>
          )}
          <small>
            Free labels come from provider metadata. Account limits still apply.
            Connection tests list models; they do not generate a billable
            answer.
          </small>
        </div>
      )}
      <details className="provider-advanced">
        <summary>Optional fallback models</summary>
        <Field
          label="Fallback model IDs"
          hint="One per line, up to three. Used at this same endpoint after rate limits or service errors. A fallback may have different pricing."
        >
          <textarea
            rows={3}
            value={(value.fallbackModels || []).join("\n")}
            onChange={(event) =>
              update({ fallbackModels: event.target.value.split("\n") })
            }
            placeholder="Leave empty to keep using the chosen model"
          />
        </Field>
      </details>
      <div className="profile-actions" style={{ justifyContent: "flex-end" }}>
        <button className="btn-ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn-primary"
          onClick={onSave}
          disabled={
            busy ||
            testing ||
            !value.label.trim() ||
            !value.baseUrl.trim() ||
            !value.defaultModel.trim() ||
            (value.requiresKey !== false && !value.id && !value.apiKey?.trim())
          }
        >
          {busy ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <CheckCircle2 size={14} />
          )}{" "}
          Save provider
        </button>
      </div>
    </div>
  );
}
