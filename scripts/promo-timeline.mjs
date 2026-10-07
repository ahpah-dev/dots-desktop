export const SCENE_STARTS = [0, 6, 13, 21, 30, 39, 46, 54, 61, 68, 76];
export const TRANSITION_SECONDS = .55;

/** Each incoming scene starts at zero during its dissolve and continues across the cut. */
export function sceneTiming(time) {
  let index = SCENE_STARTS.findIndex((end, i) => i > 0 && time < end) - 1;
  const lastIndex = SCENE_STARTS.length - 2;
  if (index < 0) index = lastIndex;
  const localTime = time - SCENE_STARTS[index] + (index > 0 ? TRANSITION_SECONDS : 0);
  const nextTime = time - (SCENE_STARTS[index + 1] - TRANSITION_SECONDS);
  return { index, localTime, incoming: index < lastIndex && nextTime >= 0 ? { index: index + 1, localTime: nextTime, progress: nextTime / TRANSITION_SECONDS } : null };
}
