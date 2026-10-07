import { describe, expect, it } from 'vitest';
// @ts-expect-error The standalone Node media renderer uses native ES modules.
import { sceneTiming, SCENE_STARTS, TRANSITION_SECONDS } from '../scripts/promo-timeline.mjs';

describe('promotional film transitions', () => {
  it('never restarts an incoming scene when its dissolve finishes', () => {
    for (const cut of SCENE_STARTS.slice(1, -1)) {
      const before = sceneTiming(cut - 1 / 30);
      const after = sceneTiming(cut);
      expect(before.incoming.index).toBe(after.index);
      expect(after.localTime - before.incoming.localTime).toBeCloseTo(1 / 30);
      expect(after.localTime).toBeCloseTo(TRANSITION_SECONDS);
    }
  });
  it('starts each incoming scene at zero and advances it one frame at a time', () => {
    for (const cut of SCENE_STARTS.slice(1, -1)) {
      expect(sceneTiming(cut - TRANSITION_SECONDS).incoming.localTime).toBeCloseTo(0);
      const a = sceneTiming(cut - .3).incoming;
      const b = sceneTiming(cut - .3 + 1 / 30).incoming;
      expect(b.localTime - a.localTime).toBeCloseTo(1 / 30);
    }
  });
});
