// The one rule this game depends on: a car must never spawn in a lane the
// expected operation series (see path.ts) has marked as needed safe for the
// moment that car will reach the player's row. `canSpawnInLane` is the sole
// place that guarantee is enforced, so it's the one function with a focused
// automated test (see spec/crit-5.test.ts).

/**
 * Whether a car may spawn in `lane` right now, given the known-safe lane(s)
 * that must always stay open for the arrival this car would have (usually
 * one, but two during a lane change --- see `OperationSeries.safeLanesAt`).
 * Each lane in the game is checked independently and at its own randomly
 * timed moment (see engine.ts), rather than all at once as a synchronized
 * row --- this is what's left open by construction, not by chance.
 */
export function canSpawnInLane(lane: number, safeLanes: readonly number[]): boolean {
  return !safeLanes.includes(lane);
}

/**
 * Picks the lane a bonus pickup spawns in, out of that same known-safe set
 * --- so a bonus is always placed where `canSpawnInLane` already guarantees
 * no car can ever legally arrive, with no separate safety argument needed.
 */
export function pickBonusLane(safeLanes: readonly number[], rng: () => number = Math.random): number {
  return safeLanes[Math.floor(rng() * safeLanes.length)];
}
