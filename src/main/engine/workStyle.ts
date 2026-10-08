import type { Budget } from '@shared/types';
import { getWorkStyle, normalizeBudget } from '@shared/budget';

const workflows = {
  economy: [
    '1. Identify the required result and the most direct way to produce it.',
    '2. Inspect only the files or sources needed. Use one primary approach; broaden only if it fails or the task requires it.',
    '3. Do the requested work, then make one focused check of the main result. Reuse evidence already collected.',
    '4. Stop when the requested result passes that check. Skip optional polish, extra alternatives, and repeated checks.',
  ],
  balanced: [
    '1. Identify the main requirements and make a short plan.',
    '2. Inspect the relevant evidence. Compare a second approach if there is a meaningful tradeoff.',
    '3. Complete the work and check the main result plus likely failure cases. Correct problems and recheck affected behavior.',
    '4. Stop when the requirements and those checks pass. Avoid unrelated improvements or exhaustive investigation.',
  ],
  thorough: [
    '1. Break the task into requirements and clear acceptance checks.',
    '2. Investigate relevant evidence and viable alternatives. Check assumptions before choosing an approach.',
    '3. Complete every requirement, including relevant edge cases and integration effects. Cross-check important claims with independent evidence when available.',
    '4. Run the acceptance checks, review the result for omissions, and fix discovered issues. Stop when these checks pass; do not invent extra work.',
  ],
};

/** Concrete instructions work with ordinary chat/tool models; no reasoning API required. */
export function buildWorkInstructions(input: Budget): string {
  const budget = normalizeBudget(input);
  const style = getWorkStyle(budget);
  return [
    `## Work style: ${style[0].toUpperCase() + style.slice(1)}`,
    'This controls how much investigation and verification you do, not just answer length. Follow this workflow:',
    ...workflows[style],
    'Take one clear next action at a time. Read each tool result before deciding what to do next. Never claim a check passed without evidence.',
    'Always meet the user\'s explicit scope and depth. A simple task may need no tools; a complex task still needs all requested deliverables in Economy. Work style does not change your permissions.',
    budget.enforceLimits
      ? `Resource ceilings: ${budget.maxSteps} tool rounds, ${budget.maxMinutes} minutes, ${budget.maxTokens} total tokens. These are ceilings, not targets to fill. Before exhausting them, finish the most important required work and report any unfinished items honestly.`
      : `Complete the requested deliverables and verification. There is no preset token or tool-step quota to fill or stop at. Your time limit is ${budget.maxMinutes} minutes. For file tasks, create or edit the actual file using available tools before reporting completion; a description or plan is not the deliverable.`,
    'Keep the final report useful and concise in every style.',
  ].join('\n');
}

export function buildWorkProgress(input: Budget, step: number, remainingTokens: number, finishing: boolean): string {
  const style = getWorkStyle(input);
  const reviewAfter = { economy: 5, balanced: 12, thorough: 24 }[style];
  return [
    input.enforceLimits
      ? `## Current work checkpoint\nTool rounds used: ${step - 1}/${input.maxSteps}. Remaining token allowance: ${Math.max(0, remainingTokens)}.`
      : `## Current work checkpoint\nTool rounds used: ${step - 1}. Continue until the requested deliverables and required checks are complete.`,
    finishing ? 'Finish now with the verified result and any unfinished requirements. No further tools are available; do not claim pending work is complete.'
      : step > reviewAfter ? `Review your ${style} stopping criteria now. If they are met, finish. Otherwise take only the next action needed to meet a requested requirement or required check.`
      : 'Take the next action in your selected workflow; finish as soon as its stopping criteria are met.',
  ].join('\n');
}
