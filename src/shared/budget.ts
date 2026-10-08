import { DEFAULT_BUDGET, type Budget } from "./types";

export const TOKEN_PRESETS = [
  {
    id: "economy",
    label: "Economy",
    description: "Short context and concise replies. Good for free tiers.",
    budget: {
      maxSteps: 20,
      maxContextTokens: 6000,
      maxOutputTokens: 1024,
      maxTokens: 24_000,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "A useful amount of context for everyday work.",
    budget: {
      maxSteps: 60,
      maxContextTokens: 12_000,
      maxOutputTokens: 2048,
      maxTokens: 50_000,
    },
  },
  {
    id: "thorough",
    label: "Thorough",
    description: "More room for complex work and longer answers.",
    budget: {
      maxSteps: 100,
      maxContextTokens: 32_000,
      maxOutputTokens: 4096,
      maxTokens: 150_000,
    },
  },
] as const;

const bounded = (
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
) =>
  Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.floor(value!)))
    : fallback;

export function normalizeBudget(input?: Partial<Budget>): Budget {
  return {
    maxMinutes: bounded(input?.maxMinutes, 1, 1440, DEFAULT_BUDGET.maxMinutes),
    maxSteps: bounded(input?.maxSteps, 1, 500, DEFAULT_BUDGET.maxSteps),
    maxContextTokens: bounded(
      input?.maxContextTokens,
      1024,
      128_000,
      DEFAULT_BUDGET.maxContextTokens!,
    ),
    maxOutputTokens: bounded(
      input?.maxOutputTokens,
      128,
      32_000,
      DEFAULT_BUDGET.maxOutputTokens!,
    ),
    maxTokens: bounded(
      input?.maxTokens,
      1024,
      2_000_000,
      DEFAULT_BUDGET.maxTokens!,
    ),
  };
}

/** A conservative character-based estimate when an endpoint does not report usage. */
export const estimateTokens = (value: string) =>
  Math.ceil(BufferByteLength(value) / 3);
function BufferByteLength(value: string): number {
  // TextEncoder is available in the renderer and current Node/Electron runtimes.
  return new TextEncoder().encode(value).length;
}
