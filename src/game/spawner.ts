// The one rule this game depends on: a row of oncoming traffic must never
// occupy the lane the expected operation series (see path.ts) has marked
// safe for that row's arrival time. `rowLanes` is the sole place that
// guarantee is enforced, so it's the one function with a focused automated
// test (see spec/crit-5.test.ts).

/**
 * Returns which lanes a row of traffic occupies (`true` = blocked), given a
 * known-safe lane that must always stay open. `density` is a 0..1 tunable
 * (clamped) controlling how often every *other* lane gets a car --- it can
 * be as high as 1 (fully block every other lane) since the safe lane is
 * left open by construction, not by chance.
 */
export function rowLanes(
  laneCount: number,
  safeLane: number,
  density: number,
  rng: () => number = Math.random,
): boolean[] {
  const clampedDensity = Math.min(1, Math.max(0, density));
  return Array.from({ length: laneCount }, (_, lane) =>
    lane === safeLane ? false : rng() < clampedDensity,
  );
}
