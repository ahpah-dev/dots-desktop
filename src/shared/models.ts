import type { ModelInfo } from "./types";

/**
 * Curated list of official OpenAI GPT models, updated for October 2026.
 * Features the latest GPT-6.1 Sol, GPT-6 Astra (flagship that powers Dots),
 * GPT-6 Sol, GPT-6 Luna, GPT-5.6 series, and reasoning models.
 */
export const KNOWN_GPT_MODELS: ModelInfo[] = [
  // ─── GPT-6 Series (Astra, Sol & Luna) ───
  {
    id: "gpt-6.1-sol",
    label: "GPT-6.1 Sol (Default & Recommended)",
    description:
      "Latest workhorse model for coding and everyday work. Balanced flagship performance optimized for agentic coding and professional workflows.",
    isDefault: true,
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-6-astra",
    label: "GPT-6 Astra (Flagship)",
    description:
      "Frontier intelligence for the most demanding work. Designed for deep reasoning, complex software engineering, and systems architecture. Powers OpenAI Dots.",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "high",
  },
  {
    id: "gpt-6-sol",
    label: "GPT-6 Sol",
    description:
      "Previous generation workhorse model for coding and developer workflows.",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-6-luna",
    label: "GPT-6 Luna (Fast)",
    description:
      "Fast and affordable model for easier tasks, rapid iteration, and lightweight background automation.",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
  },

  // ─── Codex / GPT-5.6 & 5.5 Series ───
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    description: "Older generation workhorse model in Codex.",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    defaultReasoningEffort: "low",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "Older balanced model for straightforward work.",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max", "ultra"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "Older fast and efficient model.",
    reasoningEfforts: ["low", "medium", "high", "xhigh", "max"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    description: "Legacy coding model.",
    reasoningEfforts: ["low", "medium", "high", "xhigh"],
    defaultReasoningEffort: "medium",
  },

  // ─── Reasoning (o-Series) ───
  {
    id: "o3",
    label: "OpenAI o3",
    description:
      "Complex reasoning for mathematical, algorithmic, and architectural challenges.",
    reasoningEfforts: ["low", "medium", "high", "max"],
    defaultReasoningEffort: "high",
  },
  {
    id: "o3-mini",
    label: "OpenAI o3-mini",
    description: "Fast reasoning model tailored for programming and math.",
    reasoningEfforts: ["low", "medium", "high"],
    defaultReasoningEffort: "medium",
  },
  {
    id: "o1",
    label: "OpenAI o1",
    description: "Deep reasoning model for difficult multi-step tasks.",
  },

  // ─── GPT-4o Series ───
  {
    id: "gpt-4o",
    label: "GPT-4o",
    description: "Versatile multimodal foundation model.",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    description: "Fast and lightweight model.",
  },
];

/**
 * Merge dynamically fetched models (from Codex app-server or an OpenAI endpoint)
 * with the known GPT-6/6.1 catalogue, ensuring the latest models are always available.
 */
export function mergeModelsWithCatalog(fetched: ModelInfo[]): ModelInfo[] {
  const map = new Map<string, ModelInfo>();

  // Add all known models first
  for (const m of KNOWN_GPT_MODELS) {
    map.set(m.id.toLowerCase(), { ...m });
  }

  // Merge in fetched models
  for (const f of fetched) {
    const key = f.id.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        ...f,
        label: existing.label,
        description: existing.description || f.description,
        isDefault: f.isDefault !== undefined ? f.isDefault : existing.isDefault,
        reasoningEfforts: f.reasoningEfforts?.length
          ? f.reasoningEfforts
          : existing.reasoningEfforts,
        defaultReasoningEffort:
          f.defaultReasoningEffort || existing.defaultReasoningEffort,
      });
    } else {
      map.set(key, f);
    }
  }

  // Build the ordered array: GPT-6.1 first, then GPT-6, then other known, then remaining fetched
  const result: ModelInfo[] = [];
  const seen = new Set<string>();

  // 1. Known models order
  for (const k of KNOWN_GPT_MODELS) {
    const item = map.get(k.id.toLowerCase());
    if (item && !seen.has(item.id.toLowerCase())) {
      result.push(item);
      seen.add(item.id.toLowerCase());
    }
  }

  // 2. Any additional models returned by the provider not in our catalog
  for (const [key, item] of map.entries()) {
    if (!seen.has(key)) {
      result.push(item);
      seen.add(key);
    }
  }

  return result;
}

/** Group models by category for clean UI rendering */
export interface ModelGroup {
  label: string;
  models: ModelInfo[];
}

export function groupModels(models: ModelInfo[]): ModelGroup[] {
  if (models.some(model => model.available !== undefined)) {
    const names: Record<string, string> = { oc: "OpenCode Free", ocg: "OpenCode Go", ocz: "OpenCode Zen", nvidia: "NVIDIA NIM" };
    const groups = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const prefix = model.id.includes("/") ? model.id.split("/")[0] : "Router combos";
      const label = names[prefix] || prefix;
      const group = groups.get(label) || [];
      group.push(model);
      groups.set(label, group);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([label, entries]) => ({
      label, models: entries.sort((a, b) => Number(b.available !== false) - Number(a.available !== false) || a.label.localeCompare(b.label)),
    }));
  }
  const gpt6: ModelInfo[] = [];
  const gpt5: ModelInfo[] = [];
  const oSeries: ModelInfo[] = [];
  const gpt4: ModelInfo[] = [];
  const other: ModelInfo[] = [];

  for (const m of models) {
    const id = m.id.toLowerCase();
    if (
      id.startsWith("gpt-6") ||
      id.includes("astra") ||
      (id.includes("luna") && !id.includes("5.6")) ||
      (id.includes("sol") && !id.includes("5.6"))
    ) {
      gpt6.push(m);
    } else if (id.startsWith("gpt-5") || id.includes("5.6")) {
      gpt5.push(m);
    } else if (
      id.startsWith("o1") ||
      id.startsWith("o3") ||
      id.startsWith("o4")
    ) {
      oSeries.push(m);
    } else if (id.startsWith("gpt-4")) {
      gpt4.push(m);
    } else {
      other.push(m);
    }
  }

  const groups: ModelGroup[] = [];
  if (gpt6.length)
    groups.push({ label: "GPT-6 Series (Astra, Sol & Luna)", models: gpt6 });
  if (gpt5.length)
    groups.push({ label: "Codex / GPT-5.6 Series", models: gpt5 });
  if (oSeries.length)
    groups.push({ label: "Reasoning (o-Series)", models: oSeries });
  if (gpt4.length) groups.push({ label: "GPT-4o Series", models: gpt4 });
  if (other.length) groups.push({ label: "Other Models", models: other });

  return groups;
}
