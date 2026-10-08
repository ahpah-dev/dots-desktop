import { DEFAULT_BUDGET, type Budget, type WorkStyle } from "./types";

export const TOKEN_PRESETS = [
  {
    id: "economy",
    label: "Economy",
    description: "Take the direct approach and make one focused check.",
    budget: {
      workStyle: "economy",
      maxSteps: 20,
      maxContextTokens: 6000,
      maxOutputTokens: 1024,
      maxTokens: 24_000,
    },
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Cover the main requirements and likely failure cases.",
    budget: {
      workStyle: "balanced",
      maxSteps: 60,
      maxContextTokens: 12_000,
      maxOutputTokens: 2048,
      maxTokens: 50_000,
    },
  },
  {
    id: "thorough",
    label: "Thorough",
    description: "Investigate alternatives, edge cases, and verify deeply.",
    budget: {
      workStyle: "thorough",
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

/** Keep legacy preset choices, then save the style separately from editable limits. */
export function getWorkStyle(input?: Partial<Budget>): WorkStyle {
  if (input?.workStyle === "economy" || input?.workStyle === "balanced" || input?.workStyle === "thorough") return input.workStyle;
  if (input?.maxContextTokens && input.maxContextTokens <= 6000) return "economy";
  if (input?.maxContextTokens && input.maxContextTokens >= 32_000) return "thorough";
  return "balanced";
}

export function normalizeBudget(input?: Partial<Budget>): Budget {
  return {
    enforceLimits: input?.enforceLimits === true,
    workStyle: getWorkStyle(input),
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
