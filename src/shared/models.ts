import type { ModelInfo } from './types';

/**
 * Curated list of OpenAI GPT models, prioritizing the latest GPT-6 and GPT-6.1 series,
 * followed by specialized Codex models, o-series reasoning models, and GPT-4o.
 */
export const KNOWN_GPT_MODELS: ModelInfo[] = [
  // ─── GPT-6.1 Series (Latest Flagship) ───
  {
    id: 'gpt-6.1',
    label: 'GPT-6.1 (Latest Flagship)',
    description: 'Frontier model with state-of-the-art coding, reasoning, and tool autonomy.',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
    defaultReasoningEffort: 'medium'
  },
  {
    id: 'gpt-6.1-turbo',
    label: 'GPT-6.1 Turbo',
    description: 'High-speed GPT-6.1 optimized for autonomous loops and quick iteration.',
    reasoningEfforts: ['low', 'medium', 'high']
  },
  {
    id: 'gpt-6.1-mini',
    label: 'GPT-6.1 Mini',
    description: 'Lightweight, ultra-fast GPT-6.1 for background monitors and subtasks.'
  },
  {
    id: 'gpt-6.1-codex',
    label: 'GPT-6.1 Codex',
    description: 'Dedicated GPT-6.1 variant tuned for deep codebase analysis and refactoring.',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
    defaultReasoningEffort: 'high'
  },

  // ─── GPT-6 Series ───
  {
    id: 'gpt-6',
    label: 'GPT-6 (Frontier Intelligence)',
    description: 'Advanced reasoning and architectural software synthesis.',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
    defaultReasoningEffort: 'medium'
  },
  {
    id: 'gpt-6-turbo',
    label: 'GPT-6 Turbo',
    description: 'Balanced throughput and reasoning for general engineering workflows.'
  },
  {
    id: 'gpt-6-mini',
    label: 'GPT-6 Mini',
    description: 'Fast, cost-efficient GPT-6 for routine operations.'
  },
  {
    id: 'gpt-6-codex',
    label: 'GPT-6 Codex',
    description: 'Agentic coding model for autonomous software tasks.'
  },

  // ─── GPT-5.6 / 5.5 Series ───
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    description: 'High-capability reasoning and coding model in Codex.',
    reasoningEfforts: ['low', 'medium', 'high', 'max']
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    description: 'Balanced coding and instruction execution.'
  },
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    description: 'Fast, lightweight agent model.'
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    description: 'Reliable general-purpose coding model.'
  },

  // ─── Reasoning (o-Series) ───
  {
    id: 'o3',
    label: 'OpenAI o3',
    description: 'Complex reasoning for mathematical, algorithmic, and architectural challenges.',
    reasoningEfforts: ['low', 'medium', 'high', 'max'],
    defaultReasoningEffort: 'high'
  },
  {
    id: 'o3-mini',
    label: 'OpenAI o3-mini',
    description: 'Fast reasoning model tailored for programming and math.',
    reasoningEfforts: ['low', 'medium', 'high'],
    defaultReasoningEffort: 'medium'
  },
  {
    id: 'o1',
    label: 'OpenAI o1',
    description: 'Deep reasoning model for difficult multi-step tasks.'
  },

  // ─── GPT-4o Series ───
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    description: 'Fast, versatile multimodal foundation model.'
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    description: 'Affordable and rapid general-purpose model.'
  }
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

  // Merge in fetched models (overriding or supplementing labels/defaults/reasoning)
  for (const f of fetched) {
    const key = f.id.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        ...f,
        label: existing.label.includes('GPT-6') ? existing.label : (f.label || existing.label),
        reasoningEfforts: f.reasoningEfforts?.length ? f.reasoningEfforts : existing.reasoningEfforts,
        defaultReasoningEffort: f.defaultReasoningEffort || existing.defaultReasoningEffort
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
  const gpt61: ModelInfo[] = [];
  const gpt6: ModelInfo[] = [];
  const gpt5: ModelInfo[] = [];
  const oSeries: ModelInfo[] = [];
  const gpt4: ModelInfo[] = [];
  const other: ModelInfo[] = [];

  for (const m of models) {
    const id = m.id.toLowerCase();
    if (id.startsWith('gpt-6.1') || id.includes('6.1')) {
      gpt61.push(m);
    } else if (id.startsWith('gpt-6') || id.includes('gpt-6')) {
      gpt6.push(m);
    } else if (id.startsWith('gpt-5') || id.includes('sol') || id.includes('terra') || id.includes('luna')) {
      gpt5.push(m);
    } else if (id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4')) {
      oSeries.push(m);
    } else if (id.startsWith('gpt-4')) {
      gpt4.push(m);
    } else {
      other.push(m);
    }
  }

  const groups: ModelGroup[] = [];
  if (gpt61.length) groups.push({ label: 'GPT-6.1 Series (Latest Flagship)', models: gpt61 });
  if (gpt6.length) groups.push({ label: 'GPT-6 Series (Frontier Intelligence)', models: gpt6 });
  if (gpt5.length) groups.push({ label: 'Codex / GPT-5.6 Series', models: gpt5 });
  if (oSeries.length) groups.push({ label: 'Reasoning (o-Series)', models: oSeries });
  if (gpt4.length) groups.push({ label: 'GPT-4o Series', models: gpt4 });
  if (other.length) groups.push({ label: 'Other Models', models: other });

  return groups;
}
