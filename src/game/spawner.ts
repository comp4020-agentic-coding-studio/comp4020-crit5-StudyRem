// The one rule this game depends on: a row of oncoming traffic must never
// occupy a lane the expected operation series (see path.ts) has marked
// safe for that row's arrival time. `rowLanes` is the sole place that
// guarantee is enforced, so it's the one function with a focused automated
// test (see spec/crit-5.test.ts).

/**
 * Returns which lanes a row of traffic occupies (`true` = blocked), given
 * the known-safe lane(s) that must always stay open (usually one, but two
 * during a lane change --- see `OperationSeries.safeLanesAt`). `density` is
 * a 0..1 tunable (clamped) controlling how often every *other* lane gets a
 * car --- it can be as high as 1 (fully block every other lane) since the
 * safe lanes are left open by construction, not by chance.
 */
export function rowLanes(
  laneCount: number,
  safeLanes: readonly number[],
  density: number,
  rng: () => number = Math.random,
): boolean[] {
  const clampedDensity = Math.min(1, Math.max(0, density));
  const safe = new Set(safeLanes);
  return Array.from({ length: laneCount }, (_, lane) => (safe.has(lane) ? false : rng() < clampedDensity));
}
