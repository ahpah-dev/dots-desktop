export const SCENE_STARTS = [0, 6, 13, 21, 28, 36, 43, 50, 58];
export const TRANSITION_SECONDS = .55;

/** Each incoming scene starts at zero during its dissolve and continues across the cut. */
export function sceneTiming(time) {
  let index = SCENE_STARTS.findIndex((end, i) => i > 0 && time < end) - 1;
  if (index < 0) index = 7;
  const localTime = time - SCENE_STARTS[index] + (index > 0 ? TRANSITION_SECONDS : 0);
  const nextTime = time - (SCENE_STARTS[index + 1] - TRANSITION_SECONDS);
  return { index, localTime, incoming: index < 7 && nextTime >= 0 ? { index: index + 1, localTime: nextTime, progress: nextTime / TRANSITION_SECONDS } : null };
}
