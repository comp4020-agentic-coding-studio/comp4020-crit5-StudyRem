// The one rule this game depends on: a batch of oncoming cars must always
// leave at least one lane the player can be in. `generateBatch` is the sole
// place that guarantee is enforced, so it's the one function with a focused
// automated test (see spec/crit-5.test.ts).

/**
 * Returns which lanes a batch occupies (`true` = blocked). `density` is a
 * 0..1 tunable (clamped) controlling how many lanes a batch tries to block;
 * regardless of density, at least one lane is always left open.
 */
export function generateBatch(
  laneCount: number,
  density: number,
  rng: () => number = Math.random,
): boolean[] {
  const clampedDensity = Math.min(1, Math.max(0, density));
  const blocked = Array.from({ length: laneCount }, () => rng() < clampedDensity);

  if (blocked.every(Boolean)) {
    const openLane = Math.floor(rng() * laneCount);
    blocked[openLane] = false;
  }

  return blocked;
}
